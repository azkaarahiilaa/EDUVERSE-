import type {
  CertificateData,
  ErrorCode,
  UploadErrorResponse,
  UploadSuccessResponse,
} from "@/lib/pinata-types";
import {
  createCanvas,
  loadImage,
  registerFont,
  type CanvasRenderingContext2D,
} from "canvas";
import QRCode from "qrcode";
import sharp from "sharp";
import path from "path";
import {
  uploadFileToPublicIPFS,
  uploadJSONToPrivateIPFS,
} from "./pinata-upload.service";

export {
  getCertificatePrice,
  getUserCertificateId,
  getCertificateCompletedCourses,
  checkEligibilityForCertificate as checkCertificateEligibility,
} from "./certificate-blockchain.service";

const TEMPLATE_URL =
  "https://copper-far-firefly-220.mypinata.cloud/ipfs/bafybeiaibxpgjjcjr3dgfyhhg365rt47xl2nwwrnesr6zshpompucxgn3q";

const CANVAS_WIDTH = 6250;
const CANVAS_HEIGHT = 4419;

// QR Code Configuration - Uses environment variable for deployment flexibility
const QR_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const NAME_POSITION = {
  x: CANVAS_WIDTH / 2,
  y: 1800,
  fontSize: 285,
  fontFamily: "Inter",
  fontWeight: "bold",
  color: "#2D1B4E",
  align: "center" as const,
  shadowColor: "rgba(0, 0, 0, 0.15)",
  shadowBlur: 20,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
};

const DESCRIPTION_POSITION = {
  x: CANVAS_WIDTH / 2,
  y: 2210,
  fontSize: 89,
  fontFamily: "Inter",
  color: "#4A4A4A",
  align: "center" as const,
  maxWidth: 4275,
  lineHeight: 128,
};

const QR_POSITION = {
  x: 4200,
  y: 2800,
  size: 1000,
};

let fontsRegistered = false;

function registerCertificateFonts(): void {
  if (fontsRegistered) {
    return;
  }

  try {
    const fontsDir = path.join(process.cwd(), "public", "fonts");

    registerFont(path.join(fontsDir, "Inter-Regular.ttf"), {
      family: "Inter",
      weight: "normal",
    });

    registerFont(path.join(fontsDir, "Inter-Bold.ttf"), {
      family: "Inter",
      weight: "bold",
    });

    fontsRegistered = true;
    console.log("[Certificate Service] Fonts registered successfully");
  } catch (error) {
    console.error("[Certificate Service] Failed to register fonts:", error);
    console.error(
      "[Certificate Service] Certificates will use fallback system fonts"
    );
    console.error(
      "[Certificate Service] Please ensure Inter-Regular.ttf and Inter-Bold.ttf are in public/fonts/"
    );
  }
}

/**
 * Generate QR code for certificate verification
 * @param data - Certificate data containing tokenId and recipientAddress for blockchain verification
 * @returns Buffer containing QR code image
 *
 * QR Format: {BASE_URL}/certificates?tokenId={tokenId}&address={address}
 * Example: http://192.168.18.143:3000/certificates?tokenId=1&address=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 *
 * This URL will trigger the /certificates page to:
 * 1. Parse tokenId and address from query parameters
 * 2. Query Goldsky indexer for certificate data from blockchain
 * 3. Display complete learning history and certificate details
 */
async function generateQRCode(data: CertificateData): Promise<Buffer> {
  // Construct blockchain-compatible verification URL
  const tokenId = data.tokenId || 0; // Fallback to 0 for testing/legacy
  const address = data.recipientAddress || data.walletAddress || "0x0";
  const verifyUrl = `${QR_BASE_URL}/certificates?tokenId=${tokenId}&address=${address}`;

  console.log("[Certificate Service] QR Code URL:", verifyUrl);

  const qrCodeDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: QR_POSITION.size,
    margin: 1,
    color: {
      dark: "#2D1B4E",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "H",
  });

  const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

function drawRecipientName(
  ctx: CanvasRenderingContext2D,
  name: string,
  config: typeof NAME_POSITION
): { fontSize: number; textWidth: number; scaled: boolean } {
  let fontSize = config.fontSize;
  let textWidth = 0;
  const maxWidth = CANVAS_WIDTH * 0.85;
  let scaled = false;

  ctx.font = `${config.fontWeight} ${fontSize}px ${config.fontFamily}`;
  ctx.fillStyle = config.color;
  ctx.textAlign = config.align;
  ctx.textBaseline = "middle";

  textWidth = ctx.measureText(name).width;

  if (textWidth > maxWidth) {
    scaled = true;
    const scaleFactor = maxWidth / textWidth;
    fontSize = Math.floor(fontSize * scaleFactor);
    ctx.font = `${config.fontWeight} ${fontSize}px ${config.fontFamily}`;
    textWidth = ctx.measureText(name).width;
  }

  ctx.shadowColor = config.shadowColor;
  ctx.shadowBlur = config.shadowBlur;
  ctx.shadowOffsetX = config.shadowOffsetX;
  ctx.shadowOffsetY = config.shadowOffsetY;

  ctx.fillText(name, config.x, config.y);

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  return { fontSize, textWidth, scaled };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  ctx.fillText(line.trim(), x, currentY);
}

export async function generateAndUploadCertificate(
  data: CertificateData
): Promise<UploadSuccessResponse | UploadErrorResponse> {
  const startTime = Date.now();

  try {
    registerCertificateFonts();

    console.log("[Certificate Service] Starting certificate generation...");
    console.log("[Certificate Service] Student:", data.studentName);
    console.log("[Certificate Service] Course:", data.courseName);
    console.log(
      "[Certificate Service] Note: Using Pinata PUBLIC IPFS for MetaMask compatibility"
    );

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");

    console.log("[Certificate Service] Loading template...");
    const template = await loadImage(TEMPLATE_URL);
    ctx.drawImage(template, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const nameMetrics = drawRecipientName(ctx, data.studentName, NAME_POSITION);
    console.log(
      `[Certificate Service] Name rendered (fontSize: ${nameMetrics.fontSize}px, scaled: ${nameMetrics.scaled})`
    );

    // Description paragraph
    ctx.font = `${DESCRIPTION_POSITION.fontSize}px ${DESCRIPTION_POSITION.fontFamily}`;
    ctx.fillStyle = DESCRIPTION_POSITION.color;
    ctx.textAlign = DESCRIPTION_POSITION.align;
    const description = `This evolving Certificate of Completion is awarded to ${data.studentName} for learning completed on Eduverse. It represents all verified courses completed`;
    wrapText(
      ctx,
      description,
      DESCRIPTION_POSITION.x,
      DESCRIPTION_POSITION.y,
      DESCRIPTION_POSITION.maxWidth,
      DESCRIPTION_POSITION.lineHeight
    );

    console.log("[Certificate Service] Generating QR code...");
    const qrCodeBuffer = await generateQRCode(data);
    const qrCodeImage = await loadImage(qrCodeBuffer);
    ctx.drawImage(
      qrCodeImage,
      QR_POSITION.x,
      QR_POSITION.y,
      QR_POSITION.size,
      QR_POSITION.size
    );

    console.log("[Certificate Service] Optimizing image with sharp...");
    const pngBuffer = canvas.toBuffer("image/png");
    const optimizedBuffer = await sharp(pngBuffer)
      .png({
        quality: 95,
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
      .toBuffer();

    const sizeKB = (optimizedBuffer.length / 1024).toFixed(2);
    console.log(`[Certificate Service] Image optimized (${sizeKB} KB)`);

    const uint8Array = new Uint8Array(optimizedBuffer);
    const blob = new Blob([uint8Array], { type: "image/png" });
    const file = new File([blob], `certificate-${data.certificateId}.png`, {
      type: "image/png",
    });

    console.log("[Certificate Service] Uploading to Pinata PUBLIC IPFS...");
    const imageUploadResult = await uploadFileToPublicIPFS(file, {
      name: `certificate-${data.certificateId}.png`,
      metadata: {
        courseId: data.courseId.toString(),
        fileType: "certificate",
      },
      keyvalues: {
        certificateId: data.certificateId,
        tokenId: data.tokenId?.toString() || "0",
        studentName: data.studentName,
        courseName: data.courseName,
        recipientAddress: data.recipientAddress || data.walletAddress || "0x0",
        completedCourses: data.completedCourses?.join(",") || data.courseId,
        uploadedAt: new Date().toISOString(),
        certificateVersion: "2.0",
      },
    });

    if (!imageUploadResult.success) {
      console.error("[Certificate Service] Image upload failed");
      return imageUploadResult;
    }

    console.log(
      `[Certificate Service] Image uploaded: ${imageUploadResult.data.cid}`
    );

    // ========================================
    // ERC-1155 COMPATIBLE METADATA STRUCTURE
    // ========================================
    // CRITICAL: Matches CertificateManager.sol "One Certificate Per User" model
    // This certificate GROWS with each course completion, not one per course
    // Follows OpenSea metadata standards for Goldsky indexer compatibility
    const metadata = {
      // Standard ERC-1155 fields
      name: data.platformName
        ? `${data.platformName} Certificate #${data.tokenId || 0}`
        : `EduVerse Lifetime Learning Certificate #${data.tokenId || 0}`,
      description: `This evolving certificate represents the complete learning journey of ${
        data.studentName
      } on EduVerse. It grows automatically with each completed course, creating a permanent record of continuous education. Currently includes ${
        data.completedCourses?.length || 1
      } verified course${(data.completedCourses?.length || 1) > 1 ? "s" : ""}.`,
      image: `https://${process.env.PINATA_GATEWAY}/ipfs/${imageUploadResult.data.cid}`,
      decimals: 0, // Non-fungible (ERC-1155 with amount=1)

      // Blockchain-compatible attributes matching Certificate struct fields
      attributes: [
        // === CORE CERTIFICATE DATA (from Certificate struct) ===
        {
          trait_type: "Token ID",
          display_type: "number",
          value: data.tokenId || 0,
        },
        {
          trait_type: "Platform Name",
          value: data.platformName || "EduVerse Academy",
        },
        {
          trait_type: "Recipient Name",
          value: data.studentName,
        },
        {
          trait_type: "Recipient Address",
          value: data.recipientAddress || data.walletAddress || "0x0",
        },
        {
          trait_type: "Lifetime Flag",
          display_type: "boolean",
          value: data.lifetimeFlag !== undefined ? data.lifetimeFlag : true,
        },
        {
          trait_type: "Is Valid",
          display_type: "boolean",
          value: data.isValid !== undefined ? data.isValid : true,
        },

        // === COURSE COMPLETION DATA ===
        {
          trait_type: "Total Courses Completed",
          display_type: "number",
          value: data.completedCourses?.length || 1,
        },
        ...(data.completedCourses && data.completedCourses.length > 0
          ? [
              {
                trait_type: "Completed Course IDs",
                value: data.completedCourses.join(", "),
              },
            ]
          : [
              {
                trait_type: "Completed Course IDs",
                value: data.courseId || "0",
              },
            ]),

        // === TIMESTAMPS (Unix timestamps for blockchain compatibility) ===
        {
          trait_type: "Issued At",
          display_type: "date",
          value: data.issuedAt || Math.floor(Date.now() / 1000),
        },
        {
          trait_type: "Last Updated",
          display_type: "date",
          value: data.lastUpdated || Math.floor(Date.now() / 1000),
        },

        // === VERIFICATION & PAYMENT ===
        {
          trait_type: "Payment Receipt Hash",
          value:
            data.paymentReceiptHash ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
        {
          trait_type: "Base Route",
          value: data.baseRoute || QR_BASE_URL,
        },
      ],

      // Additional properties for enhanced functionality
      properties: {
        qr_verification_url: `${QR_BASE_URL}/certificates?tokenId=${
          data.tokenId || 0
        }&address=${data.recipientAddress || data.walletAddress || "0x0"}`,
        base_route: data.baseRoute || `${QR_BASE_URL}/certificates`,
        certificate_version: "2.0", // Version 2.0 = Blockchain-compatible
        supports_multiple_courses: true,
        is_soulbound: true, // Cannot be transferred
      },
    };

    console.log("[Certificate Service] Uploading metadata to Pinata...");
    const metadataUploadResult = await uploadJSONToPrivateIPFS(metadata, {
      name: `certificate-metadata-${data.certificateId}.json`,
      metadata: {
        courseId: data.courseId.toString(),
        fileType: "certificate-metadata",
      },
    });

    if (!metadataUploadResult.success) {
      console.error("[Certificate Service] Metadata upload failed");
      return metadataUploadResult;
    }

    console.log(
      `[Certificate Service] Metadata uploaded: ${metadataUploadResult.data.cid}`
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `[Certificate Service] Certificate generation complete in ${duration}s`
    );

    return {
      success: true,
      data: {
        cid: imageUploadResult.data.cid,
        pinataId: imageUploadResult.data.pinataId,
        name: imageUploadResult.data.name,
        size: imageUploadResult.data.size,
        mimeType: imageUploadResult.data.mimeType,
        signedUrl: imageUploadResult.data.signedUrl,
        expiresAt: imageUploadResult.data.expiresAt,
        uploadedAt: imageUploadResult.data.uploadedAt,
        network: "public" as const,
        metadataCID: metadataUploadResult.data.cid,
        metadataSignedUrl: metadataUploadResult.data.signedUrl,
        metadataExpiresAt: metadataUploadResult.data.expiresAt,
      },
    };
  } catch (error: unknown) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[Certificate Service] Failed after ${duration}s`);
    console.error("[Certificate Service] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      success: false,
      error: {
        code: "CERTIFICATE_GENERATION_FAILED" as ErrorCode,
        message: errorMessage,
        details: error,
        retryable: false,
      },
    };
  }
}
