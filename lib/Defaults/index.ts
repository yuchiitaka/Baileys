import { createHash } from 'crypto';
import { proto } from '../../WAProto';
import { makeLibSignalRepository } from '../Signal/libsignal';
import { Browsers } from '../Utils';
import logger from '../Utils/logger';
import baileysVersion from './baileys-version.json';
import phonenumberMcc from './phonenumber-mcc.json';
import type { MediaType, SocketConfig } from '../Types';

export const UNAUTHORIZED_CODES = [401, 403, 419];
export const PHONENUMBER_MCC = phonenumberMcc;
export const DEFAULT_ORIGIN = "https://web.whatsapp.com";
export const MOBILE_ENDPOINT = 'g.whatsapp.net';
export const MOBILE_PORT = 443;
export const DEF_CALLBACK_PREFIX = "CB:";
export const DEF_TAG_PREFIX = "TAG:";
export const PHONE_CONNECTION_CB = "CB:Pong";
export const WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60; // 7 days in seconds

const WA_VERSION = '2.25.23.24';
const WA_VERSION_HASH = createHash('md5').update(WA_VERSION).digest('hex');
export const MOBILE_TOKEN = Buffer.from('0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM' + WA_VERSION_HASH);
export const MOBILE_REGISTRATION_ENDPOINT = 'https://v.whatsapp.net/v2';
export const MOBILE_USERAGENT = `WhatsApp/${WA_VERSION} iOS/17.5.1 Device/Apple-iPhone_13`;

export const REGISTRATION_PUBLIC_KEY = Buffer.from([
    5, 142, 140, 15, 116, 195, 235, 197, 215, 166, 134, 92, 108, 60, 132, 56, 86, 176, 97, 33, 204, 232, 234, 119, 77,
    34, 251, 111, 18, 37, 18, 48, 45,
]);

export const NOISE_MODE = "Noise_XX_25519_AESGCM_SHA256\0\0\0\0";
export const DICT_VERSION = 2;
export const KEY_BUNDLE_TYPE = Buffer.from([5]);
export const NOISE_WA_HEADER = Buffer.from([87, 65, 6, DICT_VERSION]);
export const PROTOCOL_VERSION = [5, 2];
export const MOBILE_NOISE_HEADER = Buffer.concat([Buffer.from('WA'), Buffer.from(PROTOCOL_VERSION)]);

/** from: https://stackoverflow.com/questions/3809401/what-is-a-good-regular-expression-to-match-a-url */
export const URL_REGEX = /https:\/\/(?![^:@\/\s]+:[^:@\/\s]+@)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?/g;

export const WA_CERT_DETAILS = { 
    SERIAL: 0 as number 
};

export const PROCESSABLE_HISTORY_TYPES = [
    proto.Message.HistorySyncNotification.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.Message.HistorySyncNotification.HistorySyncType.PUSH_NAME,
    proto.Message.HistorySyncNotification.HistorySyncType.RECENT,
    proto.Message.HistorySyncNotification.HistorySyncType.FULL,
    proto.Message.HistorySyncNotification.HistorySyncType.ON_DEMAND
];

export const DEFAULT_CONNECTION_CONFIG: SocketConfig = {
    version: baileysVersion.version,
    browser: Browsers.ubuntu("Chrome"),
    waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
    connectTimeoutMs: 20000,
    keepAliveIntervalMs: 30000,
    logger: logger.child({ class: "baileys" }),
    printQRInTerminal: false,
    emitOwnEvents: true,
    defaultQueryTimeoutMs: 60000,
    customUploadHosts: [],
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    fireInitQueries: true,
    auth: undefined,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    patchMessageBeforeSending: (message) => message,
    shouldSyncHistoryMessage: () => true,
    shouldIgnoreJid: () => false,
    linkPreviewImageThumbnailWidth: 192,
    transactionOpts: { 
        maxCommitRetries: 10, 
        delayBetweenTriesMs: 3000 
    },
    generateHighQualityLinkPreview: false,
    options: {},
    appStateMacVerification: { 
        patch: false, 
        snapshot: false 
    },
    getMessage: async () => { 
        return undefined; 
    },
    cachedGroupMetadata: async () => { 
        return undefined; 
    },
    makeSignalRepository: makeLibSignalRepository
};

export const MEDIA_PATH_MAP: { [T in MediaType]?: string } = {
    image: "/mms/image",
    video: "/mms/video",
    document: "/mms/document",
    audio: "/mms/audio",
    sticker: "/mms/image",
    "thumbnail-link": "/mms/image",
    "product-catalog-image": "/product/image",
    "md-app-state": "",
    "md-msg-hist": "/mms/md-app-state"
};

export const MEDIA_HKDF_KEY_MAPPING: { [key: string]: string } = {
    audio: "Audio",
    document: "Document",
    gif: "Video",
    image: "Image",
    ppic: "",
    product: "Image",
    ptt: "Audio",
    sticker: "Image",
    video: "Video",
    "thumbnail-document": "Document Thumbnail",
    "thumbnail-image": "Image Thumbnail",
    "thumbnail-video": "Video Thumbnail",
    "thumbnail-link": "Link Thumbnail",
    "md-msg-hist": "History",
    "md-app-state": "App State",
    "product-catalog-image": "",
    "payment-bg-image": "Payment Background",
    ptv: "Video"
};

export const MEDIA_KEYS = Object.keys(MEDIA_PATH_MAP) as MediaType[];

export const MIN_PREKEY_COUNT = 5;
export const INITIAL_PREKEY_COUNT = 30;

export const DEFAULT_CACHE_TTLS = {
    SIGNAL_STORE: 300,
    MSG_RETRY: 3600,
    CALL_OFFER: 300,
    USER_DEVICES: 300
};