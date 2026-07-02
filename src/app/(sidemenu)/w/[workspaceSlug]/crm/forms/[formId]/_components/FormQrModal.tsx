'use client';

import { useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  SegmentedControl,
  Text,
  CopyButton,
  Box,
} from '@mantine/core';
import { IconDownload, IconCheck, IconCopy } from '@tabler/icons-react';

/**
 * QR artifact colors — these are the pixels of an EXPORTED IMAGE (dropped into
 * slide decks, posters, print), not themed UI, so they must be literal
 * black/white regardless of the app theme. 4-digit #RGBA hex, as the qrcode
 * library accepts; `#0000` = fully transparent background.
 */
// eslint-disable-next-line no-restricted-syntax -- QR export artifact color (image content, not UI theme)
const QR_TRANSPARENT = '#0000';
const QR_MODULES: Record<QrVariant, string> = {
  // eslint-disable-next-line no-restricted-syntax -- QR export artifact color (image content, not UI theme)
  dark: '#000f',
  // eslint-disable-next-line no-restricted-syntax -- QR export artifact color (image content, not UI theme)
  light: '#ffff',
};

type QrVariant = 'dark' | 'light';

const PREVIEW_SIZE = 512;
const DOWNLOAD_SIZE = 2048;

interface FormQrModalProps {
  opened: boolean;
  onClose: () => void;
  /** Public form URL to encode (absolute). */
  url: string;
  /** Form slug — used for the download file names. */
  slug: string;
}

/**
 * Share-a-form QR modal: renders the public /f/[slug] URL as a QR code with a
 * TRANSPARENT background (drop it straight onto a slide or poster), in a dark-
 * or white-modules variant (white for dark decks). Downloads as PNG (2048px)
 * or SVG (vector, print). Generated entirely client-side — the URL never
 * leaves the browser.
 */
export function FormQrModal({ opened, onClose, url, slug }: FormQrModalProps) {
  const [variant, setVariant] = useState<QrVariant>('dark');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    void (async () => {
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, {
        width: PREVIEW_SIZE,
        margin: 1,
        color: { dark: QR_MODULES[variant], light: QR_TRANSPARENT },
      });
      if (!cancelled) setPreviewSrc(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, variant, url]);

  const triggerDownload = (href: string, filename: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadPng = async () => {
    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.toDataURL(url, {
      width: DOWNLOAD_SIZE,
      margin: 1,
      color: { dark: QR_MODULES[variant], light: QR_TRANSPARENT },
    });
    triggerDownload(dataUrl, `${slug}-qr-${variant}.png`);
  };

  const downloadSvg = async () => {
    const QRCode = await import('qrcode');
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: { dark: QR_MODULES[variant], light: QR_TRANSPARENT },
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, `${slug}-qr-${variant}.svg`);
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Share via QR code" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Encodes <Text span ff="monospace" size="sm">{url}</Text>. Transparent
          background — drop it straight onto slides, posters, or print.
        </Text>

        <SegmentedControl
          value={variant}
          onChange={(v) => setVariant(v as QrVariant)}
          data={[
            { value: 'dark', label: 'Dark modules (light backgrounds)' },
            { value: 'light', label: 'White modules (dark backgrounds)' },
          ]}
          fullWidth
        />

        {/* Checkerboard from theme tokens so the transparency is visible in
            the preview regardless of app theme. */}
        <Box
          p="md"
          style={{
            display: 'flex',
            justifyContent: 'center',
            borderRadius: 'var(--mantine-radius-md)',
            background:
              'repeating-conic-gradient(var(--background-secondary) 0% 25%, var(--background-primary) 0% 50%) 0 0 / 24px 24px',
          }}
        >
          {previewSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- data URL preview; next/image adds nothing here
            <img
              src={previewSrc}
              alt={`QR code for ${url}`}
              width={220}
              height={220}
            />
          )}
        </Box>

        <Group grow>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={() => void downloadPng()}
          >
            PNG (2048px)
          </Button>
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={() => void downloadSvg()}
          >
            SVG (vector)
          </Button>
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <Button
                variant="subtle"
                leftSection={
                  copied ? <IconCheck size={16} /> : <IconCopy size={16} />
                }
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
          </CopyButton>
        </Group>

        <Text size="xs" c="dimmed">
          PNG suits slide decks; SVG scales losslessly for print. Pick white
          modules for dark slides — the background stays transparent either
          way.
        </Text>
      </Stack>
    </Modal>
  );
}
