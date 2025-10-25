import { proto } from '../../WAProto';

declare namespace sock {
    interface MediaUploadOptions {
        fileEncSha256?: Buffer;
        mediaType?: string;
        newsletter?: boolean;
    }

    type WAMediaUploadFunction = (
        stream: Buffer | NodeJS.ReadableStream, 
        options?: MediaUploadOptions
    ) => Promise<{ url: string; directPath: string }>;

    interface WAMessageContentGenerationOptions {
        upload?: WAMediaUploadFunction;
        mediaCache?: any;
        options?: any;
        logger?: any;
    }

    interface StickerMessage {
        url: string;
        fileSha256: Buffer | string;
        fileEncSha256: Buffer | string;
        mediaKey: Buffer | string;
        mimetype: string;
        directPath: string;
        fileLength: number | string;
        mediaKeyTimestamp: number | string;
        isAnimated?: boolean;
        stickerSentTs?: number | string;
        isAvatar?: boolean;
        isAiSticker?: boolean;
        isLottie?: boolean;
    }

    interface PaymentMessage {
        amount: number;
        currency?: string;
        from?: string;
        expiry?: number;
        sticker?: { stickerMessage: StickerMessage };
        note?: string;
        background?: {
            id?: string;
            fileLength?: string;
            width?: number;
            height?: number;
            mimetype?: string;
            placeholderArgb?: number;
            textArgb?: number;
            subtextArgb?: number;
        };
    }

    interface ProductMessage {
        title: string;
        description: string;
        thumbnail: Buffer | { url: string };
        productId: string;
        retailerId: string;
        url: string;
        body?: string;
        footer?: string;
        buttons?: proto.Message.InteractiveMessage.INativeFlowButton[];
        priceAmount1000?: number | null;
        currencyCode?: string;
    }
    
    interface PayButtonMessage {
        amount: number;
        currency?: string;
        from?: string;
        expiry?: number;
        sticker?: { stickerMessage: StickerMessage };
        note?: string;
        background?: {
            id?: string;
            fileLength?: string;
            width?: number;
            height?: number;
            mimetype?: string;
            placeholderArgb?: number;
            textArgb?: number;
            subtextArgb?: number;
        };
        interactiveButtons?: proto.Message.InteractiveMessage.INativeFlowButton[]; 
    }

    interface InteractiveMessage {
        title: string;
        footer?: string;
        thumbnail?: string;
        image?: string | Buffer | { url: string };
        video?: string | Buffer | { url: string };
        document?: Buffer;
        mimetype?: string;
        fileName?: string;
        jpegThumbnail?: Buffer; // Hanya Buffer saja
        contextInfo?: {
            mentionedJid?: string[];
            forwardingScore?: number;
            isForwarded?: boolean;
            externalAdReply?: {
                title?: string;
                body?: string;
                mediaType?: number;
                thumbnailUrl?: string;
                mediaUrl?: string;
                sourceUrl?: string;
                showAdAttribution?: boolean;
                renderLargerThumbnail?: boolean;
                [key: string]: any;
            };
            [key: string]: any;
        };
        externalAdReply?: {
            title?: string;
            body?: string;
            mediaType?: number;
            thumbnailUrl?: string;
            mediaUrl?: string;
            sourceUrl?: string;
            showAdAttribution?: boolean;
            renderLargerThumbnail?: boolean;
            [key: string]: any;
        };
        buttons?: proto.Message.InteractiveMessage.INativeFlowButton[];
        nativeFlowMessage?: {
            messageParamsJson?: string;
            buttons?: proto.Message.InteractiveMessage.INativeFlowButton[];
            [key: string]: any;
        };
    }

interface MediaAttachment {
    imageMessage?: proto.Message.IImageMessage;
    videoMessage?: proto.Message.IVideoMessage;
    documentMessage?: proto.Message.IDocumentMessage;
  }

  interface InteractiveListSectionButton {
    title: string;
    rows: {
      title: string;
      description?: string;
      id: string;
    }[];
  }

  interface AdvancedInteractiveMessage extends MediaAttachment {
    body?: string;
    buttons?: proto.Message.InteractiveMessage.INativeFlowButton[];
    listSections?: InteractiveListSectionButton[];
    from?: string;
    forwardedNewsletterMessageInfo?: {
      newsletterJid: string;
      newsletterName: string;
    };
    contextInfo?: {
      mentionedJid?: string[];
      externalAdReply?: {
        title?: string;
        body?: string;
        thumbnail?: Buffer | string;
        sourceUrl?: string;
        mediaType?: number;
        renderLargerThumbnail?: boolean;
      };
    };
  }

    interface AlbumItem {
        image?: { url: string; caption?: string };
        video?: { url: string; caption?: string };
    }

    interface EventMessageLocation {
        degreesLatitude: number;
        degreesLongitude: number;
        name: string;
    }

    interface EventMessage {
        isCanceled?: boolean;
        name: string;
        description: string;
        location?: EventMessageLocation;
        joinLink?: string;
        startTime?: string | number;
        endTime?: string | number;
        extraGuestsAllowed?: boolean;
    }
    
    interface PollVote {
        optionName: string;
        optionVoteCount: string | number;
    }
    
    interface PollResultMessage {
        name: string;
        pollVotes: PollVote[];
    }
 
    interface MessageContent {
        requestPaymentMessage?: PaymentMessage;
        requestPayButtonMessage?: PayButtonMessage;
        productMessage?: ProductMessage;
        interactiveMessage?: InteractiveMessage;
        albumMessage?: AlbumItem[];
        eventMessage?: EventMessage;
        pollResultMessage?: PollResultMessage;
        requestInteractiveMediaMessage?: AdvancedInteractiveMessage;
        sender?: string;
    }

    interface MessageOptions {
        quoted?: proto.IWebMessageInfo;
        filter?: boolean;
    }

    interface Utils {
        prepareWAMessageMedia: (media: any, options: WAMessageContentGenerationOptions) => Promise<any>;
        generateWAMessageContent: (content: any, options: WAMessageContentGenerationOptions) => Promise<any>;
        generateWAMessageFromContent: (jid: string, content: any, options?: any) => Promise<any>;
        generateWAMessage: (jid: string, content: any, options?: any) => Promise<any>;
        generateMessageID: () => string;
    }
}

declare class sock {
    constructor(
        utils: sock.Utils,
        waUploadToServer: sock.WAMediaUploadFunction,
        relayMessageFn?: (jid: string, content: any, options?: any) => Promise<any>
    );
    
    detectType(content: sock.MessageContent): 'PAYMENT' | 'PRODUCT' | 'INTERACTIVE' | 'ALBUM' | 'EVENT' | 'POLL_RESULT' | null;

    handlePayment(
        content: { requestPaymentMessage: sock.PaymentMessage },
        quoted?: proto.IWebMessageInfo
    ): Promise<{ requestPaymentMessage: proto.Message.RequestPaymentMessage }>;

    handleProduct(
        content: { productMessage: sock.ProductMessage },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<{ viewOnceMessage: proto.Message.ViewOnceMessage }>;

    handleInteractive(
        content: { interactiveMessage: sock.InteractiveMessage },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<{ interactiveMessage: proto.Message.InteractiveMessage }>;

    handleAlbum(
        content: { albumMessage: sock.AlbumItem[] },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<any>;

    handleEvent(
        content: { eventMessage: sock.EventMessage },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<any>;
    
    handlePollResult(
        content: { pollResultMessage: sock.PollResultMessage },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<any>;
    
    sendInteractiveMediaMessage(
    jid: string,
    content: { requestInteractiveMediaMessage: sock.AdvancedInteractiveMessage },
    options?: {
      quoted?: proto.IWebMessageInfo;
      ephemeral?: boolean;
    }
  ): Promise<{ interactiveMessage: proto.Message.InteractiveMessage }>;
  
    handlePaymentInteractive(
        content: { requestPayButtonMessage: sock.PayButtonMessage },
        jid: string,
        quoted?: proto.IWebMessageInfo
    ): Promise<{ interactiveMessage: proto.Message.InteractiveMessage }>;
}

export = sock;