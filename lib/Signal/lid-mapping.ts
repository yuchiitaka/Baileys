import { LRUCache } from 'lru-cache'
import type { LIDMapping, SignalKeyStoreWithTransaction } from '../Types'
import type { ILogger } from '../Utils/logger'
import { isHostedPnUser, isLidUser, isPnUser, jidDecode, jidNormalizedUser, WAJIDDomains } from '../WABinary'

export class LIDMappingStore {
	private readonly mappingCache = new LRUCache<string, string>({
		ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
		ttlAutopurge: true,
		updateAgeOnGet: true,
		max: 10000 // Batas maksimum cache entries
	})
	private readonly keys: SignalKeyStoreWithTransaction
	private readonly logger: ILogger

	private pnToLIDFunc?: (jids: string[]) => Promise<LIDMapping[] | undefined>

	constructor(
		keys: SignalKeyStoreWithTransaction,
		logger: ILogger,
		pnToLIDFunc?: (jids: string[]) => Promise<LIDMapping[] | undefined>
	) {
		this.keys = keys
		this.pnToLIDFunc = pnToLIDFunc
		this.logger = logger
	}

	/**
	 * Store LID-PN mapping - USER LEVEL
	 */
	async storeLIDPNMappings(pairs: LIDMapping[]): Promise<void> {
		if (!pairs.length) {
			this.logger.debug('No LID-PN mappings to store')
			return
		}

		// Validate inputs dan persiapkan data untuk disimpan
		const validPairs: Array<{pnUser: string, lidUser: string}> = []
		const pairMap: { [_: string]: string } = {}

		for (const { lid, pn } of pairs) {
			if (!this.isValidLIDPNPair(lid, pn)) {
				this.logger.warn(`Invalid LID-PN mapping: ${lid}, ${pn}`)
				continue
			}

			const lidDecoded = jidDecode(lid)
			const pnDecoded = jidDecode(pn)

			if (!lidDecoded || !pnDecoded) {
				this.logger.warn(`Failed to decode JIDs: ${lid}, ${pn}`)
				continue
			}

			const pnUser = pnDecoded.user
			const lidUser = lidDecoded.user

			// Check existing mapping
			const existingLidUser = await this.getCachedLIDForPNUser(pnUser)
			if (existingLidUser === lidUser) {
				this.logger.debug({ pnUser, lidUser }, 'LID mapping already exists, skipping')
				continue
			}

			validPairs.push({ pnUser, lidUser })
			pairMap[pnUser] = lidUser
		}

		if (!validPairs.length) {
			this.logger.debug('No valid LID-PN mappings to store after validation')
			return
		}

		this.logger.trace({ pairMap }, `Storing ${validPairs.length} LID-PN mappings`)

		try {
			await this.keys.transaction(async () => {
				for (const { pnUser, lidUser } of validPairs) {
					await this.keys.set({
						'lid-mapping': {
							[pnUser]: lidUser,
							[`${lidUser}_reverse`]: pnUser
						}
					})

					this.updateCache(pnUser, lidUser)
				}
			}, 'lid-mapping')
			
			this.logger.debug(`Successfully stored ${validPairs.length} LID-PN mappings`)
		} catch (error) {
			this.logger.error({ error }, 'Failed to store LID-PN mappings')
			throw error
		}
	}

	/**
	 * Get LID for PN - Returns device-specific LID based on user mapping
	 */
	async getLIDForPN(pn: string): Promise<string | null> {
		const results = await this.getLIDsForPNs([pn])
		return results?.[0]?.lid || null
	}

	async getLIDsForPNs(pns: string[]): Promise<LIDMapping[] | null> {
		if (!pns.length) {
			return []
		}

		const usyncFetch: Map<string, number[]> = new Map() // Menggunakan Map untuk struktur data yang lebih baik
		const successfulPairs: Map<string, LIDMapping> = new Map()

		for (const pn of pns) {
			if (!isPnUser(pn) && !isHostedPnUser(pn)) {
				this.logger.trace(`Invalid PN JID format: ${pn}`)
				continue
			}

			const decoded = jidDecode(pn)
			if (!decoded) {
				this.logger.warn(`Failed to decode PN JID: ${pn}`)
				continue
			}

			const pnUser = decoded.user
			const lidUser = await this.getCachedLIDForPNUser(pnUser)

			if (lidUser) {
				const deviceSpecificLid = this.constructDeviceSpecificJID(lidUser, decoded.device, decoded.server === 'hosted')
				
				this.logger.trace(`getLIDForPN: ${pn} → ${deviceSpecificLid} (user mapping with device ${decoded.device})`)
				successfulPairs.set(pn, { lid: deviceSpecificLid, pn })
			} else {
				this.logger.trace(`No LID mapping found for PN user ${pnUser}; will batch fetch from USync`)
				const device = decoded.device ?? 0
				let normalizedPn = jidNormalizedUser(pn)
				
				if (isHostedPnUser(normalizedPn)) {
					normalizedPn = `${pnUser}@s.whatsapp.net`
				}

				const existingDevices = usyncFetch.get(normalizedPn) || []
				existingDevices.push(device)
				usyncFetch.set(normalizedPn, existingDevices)
			}
		}

		// Process USync fetch jika ada
		if (usyncFetch.size > 0) {
			const usyncResults = await this.fetchFromUSync(Array.from(usyncFetch.keys()))
			
			if (usyncResults && usyncResults.length > 0) {
				// Store mappings yang didapat dari USync
				await this.storeLIDPNMappings(usyncResults)
				
				// Process results untuk setiap device
				for (const pair of usyncResults) {
					const pnDecoded = jidDecode(pair.pn)
					const lidDecoded = jidDecode(pair.lid)
					
					if (!pnDecoded || !lidDecoded) continue

					const pnUser = pnDecoded.user
					const lidUser = lidDecoded.user
					const devices = usyncFetch.get(pair.pn)

					if (devices) {
						for (const device of devices) {
							const isHosted = device === 99
							const deviceSpecificLid = this.constructDeviceSpecificJID(lidUser, device, isHosted)
							const deviceSpecificPn = this.constructDeviceSpecificJID(pnUser, device, isHosted)

							this.logger.trace(
								`getLIDForPN: USYNC success for ${pair.pn} → ${deviceSpecificLid} (user mapping with device ${device})`
							)

							successfulPairs.set(deviceSpecificPn, { 
								lid: deviceSpecificLid, 
								pn: deviceSpecificPn 
							})
						}
					}
				}
			} else {
				this.logger.warn('Failed to fetch LID mappings from USync')
			}
		}

		return successfulPairs.size > 0 ? Array.from(successfulPairs.values()) : null
	}

	/**
	 * Get PN for LID - USER LEVEL with device construction
	 */
	async getPNForLID(lid: string): Promise<string | null> {
		if (!isLidUser(lid)) {
			this.logger.trace(`Invalid LID JID format: ${lid}`)
			return null
		}

		const decoded = jidDecode(lid)
		if (!decoded) {
			this.logger.warn(`Failed to decode LID JID: ${lid}`)
			return null
		}

		const lidUser = decoded.user
		const pnUser = await this.getCachedPNForLIDUser(lidUser)

		if (!pnUser) {
			this.logger.trace(`No reverse mapping found for LID user: ${lidUser}`)
			return null
		}

		// Construct device-specific PN JID
		const isHosted = decoded.domainType === WAJIDDomains.HOSTED_LID
		const pnJid = this.constructDeviceSpecificJID(pnUser, decoded.device, isHosted)

		this.logger.trace(`Found reverse mapping: ${lid} → ${pnJid}`)
		return pnJid
	}

	/**
	 * Clear cache for specific users
	 */
	clearCacheForUsers(pnUsers: string[], lidUsers: string[]): void {
		for (const pnUser of pnUsers) {
			this.mappingCache.delete(`pn:${pnUser}`)
		}
		for (const lidUser of lidUsers) {
			this.mappingCache.delete(`lid:${lidUser}`)
		}
		this.logger.trace(`Cleared cache for ${pnUsers.length} PN users and ${lidUsers.length} LID users`)
	}

	/**
	 * Get cache statistics (untuk debugging/monitoring)
	 */
	getCacheStats(): { size: number; max: number; ttl: number } {
		return {
			size: this.mappingCache.size,
			max: this.mappingCache.max,
			ttl: this.mappingCache.ttl
		}
	}

	// ========== PRIVATE HELPER METHODS ==========

	private isValidLIDPNPair(lid: string, pn: string): boolean {
		return (isLidUser(lid) && isPnUser(pn)) || (isPnUser(lid) && isLidUser(pn))
	}

	private async getCachedLIDForPNUser(pnUser: string): Promise<string | null> {
		// Check cache first
		let lidUser = this.mappingCache.get(`pn:${pnUser}`)
		
		if (!lidUser) {
			// Cache miss - check database
			const stored = await this.keys.get('lid-mapping', [pnUser])
			lidUser = stored[pnUser]
			
			if (lidUser && typeof lidUser === 'string') {
				// Update cache dengan value dari database
				this.updateCache(pnUser, lidUser)
			}
		}

		return lidUser && typeof lidUser === 'string' ? lidUser : null
	}

	private async getCachedPNForLIDUser(lidUser: string): Promise<string | null> {
		// Check cache first
		let pnUser = this.mappingCache.get(`lid:${lidUser}`)
		
		if (!pnUser || typeof pnUser !== 'string') {
			// Cache miss - check database
			const stored = await this.keys.get('lid-mapping', [`${lidUser}_reverse`])
			pnUser = stored[`${lidUser}_reverse`]
			
			if (pnUser && typeof pnUser === 'string') {
				this.mappingCache.set(`lid:${lidUser}`, pnUser)
			}
		}

		return pnUser && typeof pnUser === 'string' ? pnUser : null
	}

	private updateCache(pnUser: string, lidUser: string): void {
		this.mappingCache.set(`pn:${pnUser}`, lidUser)
		this.mappingCache.set(`lid:${lidUser}`, pnUser)
	}

	private constructDeviceSpecificJID(user: string, device: number | undefined, isHosted: boolean): string {
		const deviceSuffix = device !== undefined && device !== 0 ? `:${device}` : ''
		const domain = isHosted ? 
			(device === 99 ? 'hosted' : 's.whatsapp.net') : 
			(device === 99 ? 'hosted.lid' : 'lid')
		
		return `${user}${deviceSuffix}@${domain}`
	}

	private async fetchFromUSync(jids: string[]): Promise<LIDMapping[] | undefined> {
		if (!this.pnToLIDFunc) {
			this.logger.warn('pnToLIDFunc not available for USync fetch')
			return undefined
		}

		try {
			this.logger.debug(`Fetching ${jids.length} LID mappings from USync`)
			return await this.pnToLIDFunc(jids)
		} catch (error) {
			this.logger.error({ error, jids }, 'Failed to fetch LID mappings from USync')
			return undefined
		}
	}
}