"use client";

import { Award, Download, ExternalLink, Share2 } from 'lucide-react';
import { useQRCode } from 'next-qrcode';
import Image from 'next/image';
import { useState } from 'react';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface CertificateDisplayProps {
  tokenId: string;
  recipientName: string;
  ipfsCID: string;
  issuedAt: number;
  totalCoursesCompleted: number;
  isValid: boolean;
  baseRoute?: string;
  className?: string;
}

/**
 * CertificateDisplay Component
 *
 * A beautiful, theme-aware component for displaying blockchain certificates.
 * Features:
 * - Dark/light mode support
 * - QR code generation for verification
 * - Download and share functionality
 * - Mobile responsive
 *
 * @param {string} tokenId - NFT token ID
 * @param {string} recipientName - Certificate recipient
 * @param {string} ipfsCID - IPFS hash of certificate image
 * @param {number} issuedAt - Timestamp when issued
 * @param {number} totalCoursesCompleted - Number of courses
 * @param {boolean} isValid - Certificate validity status
 * @param {string} baseRoute - Base URL for QR verification
 */
export function CertificateDisplay({
  tokenId,
  recipientName,
  ipfsCID,
  issuedAt,
  totalCoursesCompleted,
  isValid,
  baseRoute = 'https://verify.eduverse.com/certificate',
  className = '',
}: CertificateDisplayProps) {
  const { Canvas } = useQRCode();
  const [isDownloading, setIsDownloading] = useState(false);

  // Format date
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Certificate image URL
  const certificateUrl = `https://copper-far-firefly-220.mypinata.cloud/ipfs/${ipfsCID}`;

  // QR verification URL
  const verificationUrl = `${baseRoute}?token=${tokenId}`;

  // Handle download
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(certificateUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eduverse-certificate-${tokenId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Certificate downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download certificate');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle share
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Eduverse Certificate',
          text: `I earned a blockchain certificate on Eduverse! ${totalCoursesCompleted} courses completed.`,
          url: verificationUrl,
        });
        toast.success('Shared successfully!');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Share error:', error);
          toast.error('Failed to share');
        }
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(verificationUrl);
      toast.success('Verification link copied to clipboard!');
    }
  };

  // Handle view on IPFS
  const handleViewIPFS = () => {
    window.open(certificateUrl, '_blank');
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Certificate of Completion</CardTitle>
              <CardDescription>
                Blockchain-verified • Token #{tokenId}
              </CardDescription>
            </div>
          </div>

          {isValid && (
            <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium">
              ✓ Valid
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Certificate Image */}
        <div className="relative aspect-[1754/1240] w-full overflow-hidden rounded-lg border border-border bg-muted">
          <Image
            src={certificateUrl}
            alt={`Certificate for ${recipientName}`}
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* Certificate Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Recipient</p>
            <p className="font-semibold">{recipientName}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Issued Date</p>
            <p className="font-semibold">{formatDate(issuedAt)}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Courses Completed</p>
            <p className="font-semibold">{totalCoursesCompleted}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Token ID</p>
            <p className="font-mono text-sm font-semibold">#{tokenId}</p>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex-shrink-0 p-2 bg-white rounded-lg">
              <Canvas
                text={verificationUrl}
                options={{
                  errorCorrectionLevel: 'H',
                  margin: 1,
                  scale: 4,
                  width: 120,
                  color: {
                    dark: '#2D1B4E',
                    light: '#FFFFFF',
                  },
                }}
              />
            </div>

            <div className="flex-1 space-y-2 text-center md:text-left">
              <p className="font-semibold">Verify on Blockchain</p>
              <p className="text-sm text-muted-foreground">
                Scan this QR code or visit the verification URL to confirm the authenticity of this certificate on the blockchain.
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {verificationUrl}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            variant="default"
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>

          <Button
            onClick={handleShare}
            variant="outline"
            className="w-full"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>

          <Button
            onClick={handleViewIPFS}
            variant="outline"
            className="w-full"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View on IPFS
          </Button>
        </div>

        {/* IPFS Information */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">IPFS CID:</span>{' '}
            <span className="font-mono">{ipfsCID}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This certificate is permanently stored on IPFS and linked to your NFT on the blockchain.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
