import { eq } from "drizzle-orm";
import {
  db,
  shops,
  orders,
  orderItems,
  documents,
  printJobs,
  auditLogs,
} from "../../core/database/index.js";
import { config } from "../../core/config/index.js";
import { PricingService } from "../pricing/pricing.service.js";

export interface WhatsAppIncomingParams {
  shopId?: string;
  senderPhone: string;
  filename: string;
  mimeType?: string;
  fileSizeBytes?: number;
  caption?: string;
  mediaUrl?: string;
  pageCount?: number;
}

export interface WhatsAppPrintResult {
  success: boolean;
  orderId: string;
  orderCode: string;
  shopName: string;
  customerPhone: string;
  filename: string;
  pages: number;
  copies: number;
  colorMode: "BW" | "COLOR";
  duplexMode: "SIMPLEX" | "DUPLEX";
  totalAmountCents: number;
  currency: string;
  printJobId: string;
  replyMessage: string;
}

export class WhatsAppService {
  /**
   * Verifies Meta WhatsApp Cloud Webhook subscription challenge
   */
  static verifyWebhookChallenge(params: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): string | null {
    if (
      params.mode === "subscribe" &&
      params.token === config.WHATSAPP_VERIFY_TOKEN
    ) {
      return params.challenge || null;
    }
    return null;
  }

  /**
   * Parses customer text captions for print preferences
   * Examples: "2 copies color", "front and back 3x", "5 copies bw duplex"
   */
  static parseCaptionParameters(caption = ""): {
    colorMode: "BW" | "COLOR";
    duplexMode: "SIMPLEX" | "DUPLEX";
    copies: number;
    pages?: number;
  } {
    const text = caption.toLowerCase();

    // 1. Color vs Black & White
    const isColor =
      text.includes("color") ||
      text.includes("colour") ||
      text.includes("rangeen");
    const colorMode: "BW" | "COLOR" = isColor ? "COLOR" : "BW";

    // 2. Simplex vs Duplex (Both sides)
    const isDuplex =
      text.includes("duplex") ||
      text.includes("both side") ||
      text.includes("both sides") ||
      text.includes("front and back") ||
      text.includes("front back") ||
      text.includes("double side") ||
      text.includes("two sided");
    const duplexMode: "SIMPLEX" | "DUPLEX" = isDuplex ? "DUPLEX" : "SIMPLEX";

    // 3. Number of copies
    let copies = 1;
    const copiesMatch =
      text.match(/(\d+)\s*(copies|copy|sets|set|x\b)/i) ||
      text.match(/\b(copies|copy):\s*(\d+)/i);

    if (copiesMatch) {
      const num = parseInt(copiesMatch[1] || copiesMatch[2], 10);
      if (!isNaN(num) && num > 0 && num <= 100) {
        copies = num;
      }
    }

    // 4. Page count hint if mentioned
    let pages: number | undefined;
    const pagesMatch = text.match(/(\d+)\s*(pages|page|pgs|pg)\b/i);
    if (pagesMatch) {
      const p = parseInt(pagesMatch[1], 10);
      if (!isNaN(p) && p > 0) pages = p;
    }

    return { colorMode, duplexMode, copies, pages };
  }

  /**
   * Generates a 4-digit human-friendly order code (e.g. QP-7812)
   */
  private static generateOrderCode(): string {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return `QP-${randomDigits}`;
  }

  /**
   * Core engine: Handles an incoming WhatsApp print document
   */
  static async handleIncomingDocument(
    params: WhatsAppIncomingParams,
  ): Promise<WhatsAppPrintResult> {
    // 1. Resolve Target Shop
    let targetShop;
    if (params.shopId) {
      [targetShop] = await db
        .select()
        .from(shops)
        .where(eq(shops.id, params.shopId))
        .limit(1);
    }

    if (!targetShop) {
      // Default to first active shop in database
      [targetShop] = await db
        .select()
        .from(shops)
        .where(eq(shops.isOpen, true))
        .limit(1);
    }

    if (!targetShop) {
      throw new Error(
        "No active print shop found to receive WhatsApp print order",
      );
    }

    // 2. Parse Print Preferences from caption or fallback
    const {
      colorMode,
      duplexMode,
      copies,
      pages: captionPages,
    } = this.parseCaptionParameters(params.caption);
    const estimatedPages = params.pageCount || captionPages || 4; // default baseline pages

    // 3. Create Ephemeral Document Record in DB
    const storageKey = `tenants/${targetShop.id}/whatsapp/${Date.now()}_${params.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const [doc] = await db
      .insert(documents)
      .values({
        shopId: targetShop.id,
        originalFilename: params.filename,
        storageKey,
        mimeType: params.mimeType || "application/pdf",
        fileSizeBytes: params.fileSizeBytes || 1024 * 50,
        pageCount: estimatedPages,
        status: "VERIFIED",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2-hour retention
      })
      .returning();

    // 4. Calculate Authoritative Pricing via Shop Rate Card
    const quote = await PricingService.calculateQuote({
      shopId: targetShop.id,
      pages: doc.pageCount,
      copies,
      colorMode,
      duplexMode,
      paperSize: "A4",
    });

    // 5. Create Order tagged with customer's WhatsApp phone number
    const orderCode = this.generateOrderCode();
    const [order] = await db
      .insert(orders)
      .values({
        shopId: targetShop.id,
        orderCode,
        customerPhone: params.senderPhone,
        customerEmail: null,
        subtotalAmountCents: quote.totalAmountCents,
        discountAmountCents: 0,
        totalAmountCents: quote.totalAmountCents,
        currency: "INR",
        status: "QUEUED", // WhatsApp counter orders go straight into QUEUED
        paymentGatewayProvider: "whatsapp",
        paymentGatewayOrderId: `wa_${Date.now()}_${orderCode}`,
      })
      .returning();

    // 6. Create Order Item
    await db.insert(orderItems).values({
      orderId: order.id,
      documentId: doc.id,
      paperSize: "A4",
      colorMode,
      duplexMode,
      pageRange: "all",
      pagesPerCopy: doc.pageCount,
      copies,
      unitPriceCents: quote.unitPriceCents,
      totalPriceCents: quote.totalAmountCents,
    });

    // 7. Enqueue in Shop Staff Print Station Terminal immediately
    const [job] = await db
      .insert(printJobs)
      .values({
        shopId: targetShop.id,
        orderId: order.id,
        status: "QUEUED",
      })
      .returning();

    // 8. Log Audit Trail
    await db.insert(auditLogs).values({
      shopId: targetShop.id,
      actorType: "CUSTOMER",
      actorId: params.senderPhone,
      action: "WHATSAPP_PRINT_RECEIVED",
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        filename: params.filename,
        phone: params.senderPhone,
        totalAmountCents: quote.totalAmountCents,
        printJobId: job.id,
      },
    });

    // 9. Craft Customer WhatsApp Automated Confirmation Message
    const formattedPrice = `₹${(quote.totalAmountCents / 100).toFixed(2)}`;
    const replyMessage =
      `👋 *Hello! Your print order has been received!*\n\n` +
      `📄 *File:* ${params.filename} (${doc.pageCount} pages)\n` +
      `🔢 *Order Code:* *${orderCode}*\n` +
      `⚙️ *Options:* ${colorMode === "COLOR" ? "🎨 Color" : "📄 B&W"} • ${duplexMode === "DUPLEX" ? "Double-Sided" : "Single-Sided"} • ${copies} copy\n` +
      `💰 *Total Amount:* *${formattedPrice}*\n` +
      `📍 *Shop Location:* *${targetShop.name}*\n\n` +
      `✅ *Status:* Queued at the counter! Show order code *${orderCode}* at pickup to pay cash/UPI and collect.`;

    return {
      success: true,
      orderId: order.id,
      orderCode: order.orderCode,
      shopName: targetShop.name,
      customerPhone: params.senderPhone,
      filename: params.filename,
      pages: doc.pageCount,
      copies,
      colorMode,
      duplexMode,
      totalAmountCents: quote.totalAmountCents,
      currency: quote.currency,
      printJobId: job.id,
      replyMessage,
    };
  }

  /**
   * Normalizes incoming webhooks from Meta Cloud API, Twilio, or Direct REST
   */
  static async processGenericWebhook(
    body: any,
    queryShopId?: string,
  ): Promise<WhatsAppPrintResult> {
    // A) Meta WhatsApp Cloud API format
    const metaMessage = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (metaMessage) {
      const senderPhone = metaMessage.from || "unknown";
      let filename = "whatsapp_document.pdf";
      let mimeType = "application/pdf";
      let caption = "";

      if (metaMessage.type === "document" && metaMessage.document) {
        filename = metaMessage.document.filename || "document.pdf";
        mimeType = metaMessage.document.mime_type || "application/pdf";
        caption = metaMessage.document.caption || "";
      } else if (metaMessage.type === "image" && metaMessage.image) {
        filename = `image_${Date.now()}.jpg`;
        mimeType = metaMessage.image.mime_type || "image/jpeg";
        caption = metaMessage.image.caption || "";
      } else if (metaMessage.type === "text") {
        caption = metaMessage.text?.body || "";
      }

      return await this.handleIncomingDocument({
        shopId: queryShopId,
        senderPhone,
        filename,
        mimeType,
        caption,
      });
    }

    // B) Twilio WhatsApp Webhook format
    if (body?.From && (body?.MediaUrl0 || body?.Body)) {
      const senderPhone = (body.From || "").replace("whatsapp:", "");
      const filename = body.MediaContentType0
        ? `whatsapp_doc_${Date.now()}.${body.MediaContentType0.split("/")[1] || "pdf"}`
        : "whatsapp_document.pdf";
      const caption = body.Body || "";

      return await this.handleIncomingDocument({
        shopId: queryShopId,
        senderPhone,
        filename,
        mimeType: body.MediaContentType0 || "application/pdf",
        mediaUrl: body.MediaUrl0,
        caption,
      });
    }

    // C) Standard / Simulated WhatsApp Payload
    const senderPhone = body?.senderPhone || body?.phone || "+919876543210";
    const filename = body?.filename || "whatsapp_print.pdf";
    const caption = body?.caption || body?.message || "";
    const shopId = body?.shopId || queryShopId;

    return await this.handleIncomingDocument({
      shopId,
      senderPhone,
      filename,
      caption,
      pageCount: body?.pageCount,
      fileSizeBytes: body?.fileSizeBytes,
    });
  }
}
