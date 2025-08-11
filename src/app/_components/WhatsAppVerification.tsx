'use client';

import { useState } from 'react';
import {
  Modal,
  Stack,
  TextInput,
  Button,
  Group,
  Alert,
  Text,
  PinInput,
  Stepper,
  LoadingOverlay,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconPhone,
  IconShieldCheck,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
} from '@tabler/icons-react';
import { api } from '~/trpc/react';

interface WhatsAppVerificationProps {
  integrationId: string;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WhatsAppVerification({ 
  integrationId, 
  opened, 
  onClose,
  onSuccess 
}: WhatsAppVerificationProps) {
  const [step, setStep] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const phoneForm = useForm({
    initialValues: {
      phoneNumber: '',
    },
    validate: {
      phoneNumber: (value) => {
        if (!value) return 'Phone number is required';
        if (!value.match(/^\+?[1-9]\d{1,14}$/)) {
          return 'Invalid phone number format. Use international format (e.g., +1234567890)';
        }
        return null;
      },
    },
  });

  const codeForm = useForm({
    initialValues: {
      code: '',
    },
    validate: {
      code: (value) => {
        if (!value || value.length !== 6) return 'Please enter the 6-digit code';
        return null;
      },
    },
  });

  // Request verification code
  const requestVerification = api.integration.requestWhatsAppVerification.useMutation({
    onSuccess: (data) => {
      notifications.show({
        title: 'Code Sent',
        message: data.message,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      
      // In development, show the code
      if (data.debugCode) {
        notifications.show({
          title: 'Development Mode',
          message: `Your verification code is: ${data.debugCode}`,
          color: 'blue',
          autoClose: false,
        });
      }
      
      setStep(1);
    },
    onError: (error) => {
      notifications.show({
        title: 'Failed to Send Code',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Verify code
  const verifyCode = api.integration.verifyWhatsAppPhone.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Phone Verified',
        message: 'Your phone number has been successfully verified and linked',
        color: 'green',
        icon: <IconShieldCheck size={16} />,
      });
      setStep(2);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    },
    onError: (error) => {
      notifications.show({
        title: 'Verification Failed',
        message: error.message,
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Get verification status
  const { data: status } = api.integration.getVerificationStatus.useQuery(
    { integrationId, phoneNumber },
    { enabled: !!phoneNumber && step === 1, refetchInterval: 5000 }
  );

  const handlePhoneSubmit = async (values: typeof phoneForm.values) => {
    setIsLoading(true);
    setPhoneNumber(values.phoneNumber);
    try {
      await requestVerification.mutateAsync({
        integrationId,
        phoneNumber: values.phoneNumber,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeSubmit = async (values: typeof codeForm.values) => {
    setIsLoading(true);
    try {
      await verifyCode.mutateAsync({
        integrationId,
        phoneNumber,
        code: values.code,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    try {
      await requestVerification.mutateAsync({
        integrationId,
        phoneNumber,
      });
      codeForm.reset();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Verify WhatsApp Phone Number"
      size="md"
      closeOnClickOutside={false}
    >
      <LoadingOverlay visible={isLoading} />
      
      <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false}>
        <Stepper.Step 
          label="Enter Phone Number" 
          description="Provide your WhatsApp number"
          icon={<IconPhone size={18} />}
        >
          <Stack mt="xl">
            <Alert icon={<IconPhone size={16} />} color="blue">
              Enter your WhatsApp phone number. We'll send you a verification code to confirm ownership.
            </Alert>

            <form onSubmit={phoneForm.onSubmit(handlePhoneSubmit)}>
              <Stack>
                <TextInput
                  label="WhatsApp Phone Number"
                  placeholder="+1234567890"
                  description="Use international format with country code"
                  required
                  leftSection={<IconPhone size={16} />}
                  {...phoneForm.getInputProps('phoneNumber')}
                />

                <Button type="submit" loading={requestVerification.isPending}>
                  Send Verification Code
                </Button>
              </Stack>
            </form>
          </Stack>
        </Stepper.Step>

        <Stepper.Step 
          label="Verify Code" 
          description="Enter the code sent to WhatsApp"
          icon={<IconShieldCheck size={18} />}
        >
          <Stack mt="xl">
            <Alert icon={<IconShieldCheck size={16} />} color="blue">
              We've sent a 6-digit verification code to {phoneNumber}. 
              Please check your WhatsApp messages.
            </Alert>

            {status?.hasPendingCode && (
              <Text size="sm" c="dimmed">
                Code expires in {Math.ceil((new Date(status.expiresAt!).getTime() - Date.now()) / 60000)} minutes.
                {status.attemptsRemaining && ` ${status.attemptsRemaining} attempts remaining.`}
              </Text>
            )}

            <form onSubmit={codeForm.onSubmit(handleCodeSubmit)}>
              <Stack>
                <div>
                  <Text size="sm" fw={500} mb="xs">Verification Code</Text>
                  <PinInput
                    length={6}
                    type="number"
                    placeholder="0"
                    size="lg"
                    {...codeForm.getInputProps('code')}
                  />
                </div>

                <Group>
                  <Button type="submit" loading={verifyCode.isPending} flex={1}>
                    Verify Code
                  </Button>
                  <Button 
                    variant="light" 
                    leftSection={<IconRefresh size={16} />}
                    onClick={handleResendCode}
                    disabled={requestVerification.isPending}
                  >
                    Resend
                  </Button>
                </Group>
              </Stack>
            </form>
          </Stack>
        </Stepper.Step>

        <Stepper.Completed>
          <Stack mt="xl" align="center">
            <IconCheck size={48} color="green" />
            <Text size="lg" fw={500}>Phone Number Verified!</Text>
            <Text c="dimmed">Your WhatsApp number has been successfully linked to your account.</Text>
          </Stack>
        </Stepper.Completed>
      </Stepper>
    </Modal>
  );
}