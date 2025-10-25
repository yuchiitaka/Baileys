import * as libsignal from 'libsignal';
import { proto } from '../../WAProto';
import { SignalAuthState } from '../Types';
import { SignalRepository, DecryptGroupSignalOpts, ProcessSenderKeyDistributionMessageOpts, DecryptSignalProtoOpts, EncryptMessageOpts, EncryptGroupMessageOpts, E2ESessionOpts } from '../Types/Signal';
import { generateSignalPubKey } from '../Utils';
import { jidDecode } from '../WABinary';
import { GroupCipher, GroupSessionBuilder, SenderKeyDistributionMessage } from './Group';
import { SenderKeyName } from './Group/sender-key-name';
import { SenderKeyRecord } from './Group/sender-key-record';

export function makeLibSignalRepository(auth: SignalAuthState): SignalRepository {
    const storage = signalStorage(auth);

    return {
        async decryptGroupMessage(opts: DecryptGroupSignalOpts): Promise<Buffer> {
            const { group, authorJid, msg } = opts;
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const cipher = new GroupCipher(storage, senderName);
            return cipher.decrypt(Buffer.from(msg));
        },

        async processSenderKeyDistributionMessage(opts: ProcessSenderKeyDistributionMessageOpts): Promise<void> {
            const { item, authorJid } = opts;
            const builder = new GroupSessionBuilder(storage);
            
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }

            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderMsg = new SenderKeyDistributionMessage(
                null, 
                null, 
                null, 
                null, 
                item.axolotlSenderKeyDistributionMessage
            );

            const senderNameStr = senderName.toString();
            const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
            
            if (!senderKey) {
                await storage.storeSenderKey(senderName, new SenderKeyRecord());
            }

            await builder.process(senderName, senderMsg);
        },

        async decryptMessage(opts: DecryptSignalProtoOpts): Promise<Buffer> {
            const { jid, type, ciphertext } = opts;
            const addr = jidToSignalProtocolAddress(jid);
            const session = new libsignal.SessionCipher(storage, addr);
            
            let result;
            switch (type) {
                case 'pkmsg':
                    result = await session.decryptPreKeyWhisperMessage(Buffer.from(ciphertext));
                    break;
                case 'msg':
                    result = await session.decryptWhisperMessage(Buffer.from(ciphertext));
                    break;
                default:
                    throw new Error(`Unknown message type: ${type}`);
            }

            return Buffer.from(result);
        },

        async encryptMessage(opts: EncryptMessageOpts): Promise<{ type: 'pkmsg' | 'msg'; ciphertext: Buffer }> {
            const { jid, data } = opts;
            const addr = jidToSignalProtocolAddress(jid);
            const cipher = new libsignal.SessionCipher(storage, addr);
            const { type: sigType, body } = await cipher.encrypt(Buffer.from(data));
            
            const type = sigType === 3 ? 'pkmsg' : 'msg';
            return { 
                type, 
                ciphertext: Buffer.from(body, 'binary') 
            };
        },

        async encryptGroupMessage(opts: EncryptGroupMessageOpts): Promise<{ senderKeyDistributionMessage: Buffer; ciphertext: Buffer }> {
            const { group, meId, data } = opts;
            const senderName = jidToSignalSenderKeyName(group, meId);
            const builder = new GroupSessionBuilder(storage);
            
            const senderNameStr = senderName.toString();
            const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
            
            if (!senderKey) {
                await storage.storeSenderKey(senderName, new SenderKeyRecord());
            }

            const senderKeyDistributionMessage = await builder.create(senderName);
            const session = new GroupCipher(storage, senderName);
            const ciphertext = await session.encrypt(Buffer.from(data));

            return {
                ciphertext,
                senderKeyDistributionMessage: Buffer.from(senderKeyDistributionMessage.serialize())
            };
        },

        async injectE2ESession(opts: E2ESessionOpts): Promise<void> {
            const { jid, session } = opts;
            const cipher = new libsignal.SessionBuilder(
                storage, 
                jidToSignalProtocolAddress(jid)
            );
            await cipher.initOutgoing(session);
        },

        jidToSignalProtocolAddress(jid: string): string {
            return jidToSignalProtocolAddress(jid).toString();
        }
    };
}

const jidToSignalProtocolAddress = (jid: string): libsignal.ProtocolAddress => {
    const decoded = jidDecode(jid);
    if (!decoded) {
        throw new Error(`Invalid JID: ${jid}`);
    }
    
    const { user, device } = decoded;
    return new libsignal.ProtocolAddress(user, device || 0);
};

const jidToSignalSenderKeyName = (group: string, user: string): SenderKeyName => {
    return new SenderKeyName(group, jidToSignalProtocolAddress(user));
};

function signalStorage({ creds, keys }: SignalAuthState) {
    return {
        loadSession: async (id: string) => {
            const { [id]: sess } = await keys.get('session', [id]);
            if (sess) {
                return libsignal.SessionRecord.deserialize(sess);
            }
            return undefined;
        },

        storeSession: async (id: string, session: libsignal.SessionRecord) => {
            await keys.set({ 
                session: { 
                    [id]: session.serialize() 
                } 
            });
        },

        isTrustedIdentity: () => {
            return true;
        },

        loadPreKey: async (id: number) => {
            const keyId = id.toString();
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            
            if (key) {
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
            return undefined;
        },

        removePreKey: (id: number) => {
            return keys.set({ 
                'pre-key': { 
                    [id]: null 
                } 
            });
        },

        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },

        loadSenderKey: async (senderKeyName: SenderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            
            if (key) {
                return SenderKeyRecord.deserialize(key);
            }
            
            return new SenderKeyRecord();
        },

        storeSenderKey: async (senderKeyName: SenderKeyName, key: SenderKeyRecord) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            
            await keys.set({ 
                'sender-key': { 
                    [keyId]: Buffer.from(serialized, 'utf-8') 
                } 
            });
        },

        getOurRegistrationId: () => creds.registrationId,

        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: generateSignalPubKey(signedIdentityKey.public)
            };
        }
    };
}