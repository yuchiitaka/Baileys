import { proto } from '../../WAProto';
import { GroupMetadata, ParticipantAction, SocketConfig, WAMessageStubType } from '../Types';
import { generateMessageID, unixTimestampSeconds } from '../Utils';
import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString, jidDecode, jidEncode, jidNormalizedUser, BinaryNode } from '../WABinary';
import { makeChatsSocket } from './chats';

export const makeGroupsSocket = (config: SocketConfig) => {
    const sock = makeChatsSocket(config);
    const { authState, ev, query, upsertMessage } = sock;

    const groupQuery = async (jid: string, type: string, content: BinaryNode[]) => {
        return query({
            tag: 'iq',
            attrs: {
                type,
                xmlns: 'w:g2',
                to: jid,
            },
            content
        });
    };

    const groupMetadata = async (jid: string): Promise<GroupMetadata> => {
        const result = await groupQuery(jid, 'get', [{ 
            tag: 'query', 
            attrs: { request: 'interactive' } 
        }]);
        return extractGroupMetadata(result);
    };

    const groupFetchAllParticipating = async (): Promise<{ [key: string]: GroupMetadata }> => {
        const result = await query({
            tag: 'iq',
            attrs: {
                to: '@g.us',
                xmlns: 'w:g2',
                type: 'get',
            },
            content: [
                {
                    tag: 'participating',
                    attrs: {},
                    content: [
                        { tag: 'participants', attrs: {} },
                        { tag: 'description', attrs: {} }
                    ]
                }
            ]
        });

        const data: { [key: string]: GroupMetadata } = {};
        const groupsChild = getBinaryNodeChild(result, 'groups');
        
        if (groupsChild) {
            const groups = getBinaryNodeChildren(groupsChild, 'group');
            for (const groupNode of groups) {
                const meta = extractGroupMetadata({
                    tag: 'result',
                    attrs: {},
                    content: [groupNode]
                });
                data[meta.id] = meta;
            }
        }

        sock.ev.emit('groups.update', Object.values(data));
        return data;
    };

    sock.ws.on('CB:ib,,dirty', async (node: BinaryNode) => {
        const dirtyNode = getBinaryNodeChild(node, 'dirty');
        const { attrs } = dirtyNode!;
        
        if (attrs.type !== 'groups') {
            return;
        }

        await groupFetchAllParticipating();
        await sock.cleanDirtyBits('groups');
    });

    return {
        ...sock,
        groupMetadata,
        groupCreate: async (subject: string, participants: string[]): Promise<GroupMetadata> => {
            const key = generateMessageID();
            const result = await groupQuery('@g.us', 'set', [
                {
                    tag: 'create',
                    attrs: {
                        subject,
                        key
                    },
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            return extractGroupMetadata(result);
        },
        groupLeave: async (id: string): Promise<void> => {
            await groupQuery('@g.us', 'set', [
                {
                    tag: 'leave',
                    attrs: {},
                    content: [
                        { tag: 'group', attrs: { id } }
                    ]
                }
            ]);
        },
        groupUpdateSubject: async (jid: string, subject: string): Promise<void> => {
            await groupQuery(jid, 'set', [
                {
                    tag: 'subject',
                    attrs: {},
                    content: Buffer.from(subject, 'utf-8')
                }
            ]);
        },
        groupRequestParticipantsList: async (jid: string): Promise<{ [key: string]: string }[]> => {
            const result = await groupQuery(jid, 'get', [
                {
                    tag: 'membership_approval_requests',
                    attrs: {}
                }
            ]);
            
            const node = getBinaryNodeChild(result, 'membership_approval_requests');
            const participants = getBinaryNodeChildren(node!, 'membership_approval_request');
            return participants.map(v => v.attrs);
        },
        groupRequestParticipantsUpdate: async (
            jid: string, 
            participants: string[], 
            action: 'approve' | 'reject'
        ): Promise<{ status: string; jid: string }[]> => {
            const result = await groupQuery(jid, 'set', [{
                tag: 'membership_requests_action',
                attrs: {},
                content: [
                    {
                        tag: action,
                        attrs: {},
                        content: participants.map(jid => ({
                            tag: 'participant',
                            attrs: { jid }
                        }))
                    }
                ]
            }]);
            
            const node = getBinaryNodeChild(result, 'membership_requests_action');
            const nodeAction = getBinaryNodeChild(node!, action);
            const participantsAffected = getBinaryNodeChildren(nodeAction!, 'participant');
            
            return participantsAffected.map(p => {
                return { 
                    status: p.attrs.error || '200', 
                    jid: p.attrs.jid 
                };
            });
        },
        groupParticipantsUpdate: async (
            jid: string, 
            participants: string[], 
            action: ParticipantAction
        ): Promise<{ status: string; jid: string; content: BinaryNode }[]> => {
            const result = await groupQuery(jid, 'set', [
                {
                    tag: action,
                    attrs: {},
                    content: participants.map(jid => ({
                        tag: 'participant',
                        attrs: { jid }
                    }))
                }
            ]);
            
            const node = getBinaryNodeChild(result, action);
            const participantsAffected = getBinaryNodeChildren(node!, 'participant');
            
            return participantsAffected.map(p => {
                return { 
                    status: p.attrs.error || '200', 
                    jid: p.attrs.jid,
                    content: p
                };
            });
        },
        groupUpdateDescription: async (jid: string, description?: string): Promise<void> => {
            const metadata = await groupMetadata(jid);
            const prev = metadata.descId ?? null;
            
            await groupQuery(jid, 'set', [
                {
                    tag: 'description',
                    attrs: {
                        ...(description ? { id: generateMessageID() } : { delete: 'true' }),
                        ...(prev ? { prev } : {})
                    },
                    content: description ? [
                        { 
                            tag: 'body', 
                            attrs: {}, 
                            content: Buffer.from(description, 'utf-8') 
                        }
                    ] : undefined
                }
            ]);
        },
        groupInviteCode: async (jid: string): Promise<string | undefined> => {
            const result = await groupQuery(jid, 'get', [{ 
                tag: 'invite', 
                attrs: {} 
            }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupRevokeInvite: async (jid: string): Promise<string | undefined> => {
            const result = await groupQuery(jid, 'set', [{ 
                tag: 'invite', 
                attrs: {} 
            }]);
            const inviteNode = getBinaryNodeChild(result, 'invite');
            return inviteNode?.attrs.code;
        },
        groupAcceptInvite: async (code: string): Promise<string | undefined> => {
            const results = await groupQuery('@g.us', 'set', [{ 
                tag: 'invite', 
                attrs: { code } 
            }]);
            const result = getBinaryNodeChild(results, 'group');
            return result?.attrs.jid;
        },
        /**
         * accept a GroupInviteMessage
         * @param key the key of the invite message, or optionally only provide the jid of the person who sent the invite
         * @param inviteMessage the message to accept
         */
        groupAcceptInviteV4: ev.createBufferedFunction(async (
            key: string | proto.IMessageKey, 
            inviteMessage: proto.Message.IGroupInviteMessage
        ): Promise<string> => {
            const messageKey = typeof key === 'string' ? { remoteJid: key } : key;
            
            const results = await groupQuery(inviteMessage.groupJid!, 'set', [{
                tag: 'accept',
                attrs: {
                    code: inviteMessage.inviteCode!,
                    expiration: inviteMessage.inviteExpiration!.toString(),
                    admin: messageKey.remoteJid!
                }
            }]);

            // if we have the full message key
            // update the invite message to be expired
            if (messageKey.id) {
                // create new invite message that is expired
                const expiredInviteMessage = proto.Message.GroupInviteMessage.fromObject(inviteMessage);
                expiredInviteMessage.inviteExpiration = 0;
                expiredInviteMessage.inviteCode = '';
                
                ev.emit('messages.update', [
                    {
                        key: messageKey,
                        update: {
                            message: {
                                groupInviteMessage: expiredInviteMessage
                            }
                        }
                    }
                ]);
            }

            // generate the group add message
            await upsertMessage({
                key: {
                    remoteJid: inviteMessage.groupJid!,
                    id: generateMessageID(),
                    fromMe: false,
                    participant: messageKey.remoteJid!,
                },
                messageStubType: WAMessageStubType.GROUP_PARTICIPANT_ADD,
                messageStubParameters: [
                    authState.creds.me!.id
                ],
                participant: messageKey.remoteJid!,
                messageTimestamp: unixTimestampSeconds()
            }, 'notify');

            return results.attrs.from!;
        }),
        groupGetInviteInfo: async (code: string): Promise<GroupMetadata> => {
            const results = await groupQuery('@g.us', 'get', [{ 
                tag: 'invite', 
                attrs: { code } 
            }]);
            return extractGroupMetadata(results);
        },
        groupToggleEphemeral: async (jid: string, ephemeralExpiration: number): Promise<void> => {
            const content = ephemeralExpiration ?
                { 
                    tag: 'ephemeral', 
                    attrs: { expiration: ephemeralExpiration.toString() } 
                } :
                { 
                    tag: 'not_ephemeral', 
                    attrs: {} 
                };
                
            await groupQuery(jid, 'set', [content]);
        },
        groupSettingUpdate: async (jid: string, setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'): Promise<void> => {
            await groupQuery(jid, 'set', [{ 
                tag: setting, 
                attrs: {} 
            }]);
        },
        groupMemberAddMode: async (jid: string, mode: 'admin_add' | 'all_member_add'): Promise<void> => {
            await groupQuery(jid, 'set', [{ 
                tag: 'member_add_mode', 
                attrs: {}, 
                content: [{ tag: 'add', attrs: {}, content: mode }] 
            }]);
        },
        groupJoinApprovalMode: async (jid: string, mode: 'on' | 'off'): Promise<void> => {
            await groupQuery(jid, 'set', [{ 
                tag: 'membership_approval_mode', 
                attrs: {}, 
                content: [{ 
                    tag: 'group_join', 
                    attrs: { state: mode } 
                }] 
            }]);
        },
        groupFetchAllParticipating
    };
};

export const extractGroupMetadata = (result: BinaryNode): GroupMetadata => {
    const group = getBinaryNodeChild(result, 'group');
    if (!group) {
        throw new Error('No group node found in result');
    }

    const descChild = getBinaryNodeChild(group, 'description');
    let desc: string | undefined;
    let descId: string | undefined;
    let descOwner: string | undefined;
    let descOwnerLid: string | undefined;
    let descTime: number | undefined;

    if (descChild) {
        desc = getBinaryNodeChildString(descChild, 'body');
        descOwner = jidNormalizedUser(descChild.attrs.participant_pn || descChild.attrs.participant);
        
        if (group.attrs.addressing_mode === 'lid') {
            descOwnerLid = jidNormalizedUser(descChild.attrs.participant);
        }
        
        descId = descChild.attrs.id;
        descTime = descChild.attrs.t ? +descChild.attrs.t : undefined;
    }

    const groupSize = group.attrs.size ? Number(group.attrs.size) : undefined;
    const groupId = group.attrs.id.includes('@') ? group.attrs.id : jidEncode(group.attrs.id, 'g.us');
    const eph = getBinaryNodeChild(group, 'ephemeral')?.attrs.expiration;
    const memberAddMode = getBinaryNodeChildString(group, 'member_add_mode') === 'all_member_add';

    const metadata: GroupMetadata = {
        id: groupId,
        subject: group.attrs.subject,
        subjectOwner: jidNormalizedUser(group.attrs.s_o_pn || group.attrs.s_o),
        subjectTime: group.attrs.s_t ? +group.attrs.s_t : undefined,
        size: groupSize || getBinaryNodeChildren(group, 'participant').length,
        creation: group.attrs.creation ? +group.attrs.creation : undefined,
        owner: jidNormalizedUser(group.attrs.creator_pn || group.attrs.creator),
        desc,
        descId,
        descOwner,
        descTime,
        restrict: !!getBinaryNodeChild(group, 'locked'),
        announce: !!getBinaryNodeChild(group, 'announcement'),
        isCommunity: !!getBinaryNodeChild(group, 'parent'),
        isCommunityAnnounce: !!getBinaryNodeChild(group, 'default_sub_group'),
        joinApprovalMode: !!getBinaryNodeChild(group, 'membership_approval_mode'),
        memberAddMode,
        participants: getBinaryNodeChildren(group, 'participant').map(({ attrs }) => {
            return {
                id: attrs.jid,
                jid: attrs.phone_number || attrs.jid,
                admin: (attrs.type || null) as 'admin' | 'superadmin' | null,
            };
        }),
        ephemeralDuration: eph ? +eph : undefined
    };

    // Add LID-specific fields if applicable
    if (group.attrs.addressing_mode === 'lid') {
        metadata.addressingMode = 'lid';
        metadata.subjectOwnerLid = jidNormalizedUser(group.attrs.s_o);
        metadata.ownerLid = jidNormalizedUser(group.attrs.creator);
        metadata.descOwnerLid = descOwnerLid;
    }

    return metadata;
};
