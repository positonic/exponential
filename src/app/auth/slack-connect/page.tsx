'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { api } from '~/trpc/react';
import { 
  Container, 
  Paper, 
  Title, 
  Text, 
  Button, 
  Loader, 
  Alert,
  Stack,
  Group,
  ThemeIcon
} from '@mantine/core';
import { 
  IconBrandSlack, 
  IconCheck, 
  IconAlertCircle, 
  IconClock,
  IconUser
} from '@tabler/icons-react';

export default function SlackConnectPage() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [registrationStep, setRegistrationStep] = useState<'loading' | 'login' | 'connecting' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const token = searchParams.get('token');

  // API calls
  const validateToken = api.integration.validateSlackRegistrationToken.useQuery(
    { token: token || '' },
    { 
      enabled: !!token,
      retry: false
    }
  );

  const completeRegistration = api.integration.completeSlackRegistration.useMutation({
    onSuccess: () => {
      setRegistrationStep('success');
    },
    onError: (error) => {
      setRegistrationStep('error');
      setErrorMessage(error.message);
    }
  });

  useEffect(() => {
    if (!token) {
      setRegistrationStep('error');
      setErrorMessage('Invalid registration link - missing token');
      return;
    }

    if (validateToken.isError) {
      setRegistrationStep('error');
      setErrorMessage(validateToken.error?.message || 'Invalid or expired registration token');
      return;
    }

    if (validateToken.isSuccess && status === 'loading') {
      // Still loading session
      return;
    }

    if (validateToken.isSuccess && status === 'unauthenticated') {
      // Need to log in
      setRegistrationStep('login');
      return;
    }

    if (validateToken.isSuccess && status === 'authenticated' && session?.user) {
      // Ready to complete registration
      if (registrationStep === 'loading') {
        setRegistrationStep('connecting');
        completeRegistration.mutate({
          token: token,
          userId: session.user.id
        });
      }
    }
  }, [validateToken.isSuccess, validateToken.isError, status, session, token, registrationStep, completeRegistration, validateToken.error?.message]);

  const handleSignIn = async () => {
    await signIn(undefined, { callbackUrl: window.location.href });
  };

  return (
    <Container size="sm" py="xl">
      <Paper shadow="md" p="xl" radius="md">
        <Stack gap="lg" align="center">
          <ThemeIcon size={64} radius="md" variant="light">
            <IconBrandSlack size={32} />
          </ThemeIcon>
          
          <Title order={2} ta="center">
            Connect Slack to Exponential
          </Title>

          {registrationStep === 'loading' && (
            <>
              <Loader size="md" />
              <Text ta="center" c="dimmed">
                Validating registration token...
              </Text>
            </>
          )}

          {registrationStep === 'login' && validateToken.data && (
            <>
              <Alert icon={<IconUser size={16} />} title="Authentication Required" color="blue">
                To connect your Slack account, please log in to your Exponential account first.
              </Alert>
              
              <Text ta="center" size="sm" c="dimmed">
                Connecting Slack user to team: <strong>{validateToken.data.teamName || 'Personal'}</strong>
              </Text>
              
              <Button 
                size="lg" 
                onClick={handleSignIn}
                leftSection={<IconUser size={16} />}
              >
                Sign In to Exponential
              </Button>
            </>
          )}

          {registrationStep === 'connecting' && (
            <>
              <Loader size="md" />
              <Text ta="center" c="dimmed">
                Connecting your accounts...
              </Text>
            </>
          )}

          {registrationStep === 'success' && (
            <>
              <ThemeIcon size={64} radius="md" color="green" variant="light">
                <IconCheck size={32} />
              </ThemeIcon>
              
              <Alert icon={<IconCheck size={16} />} title="Successfully Connected!" color="green">
                Your Slack account has been connected to your Exponential account.
                You can now use the Slack bot to access your projects and meeting data.
              </Alert>
              
              <Group justify="center">
                <Text ta="center" size="sm" c="dimmed">
                  Go back to Slack and try your command again!
                </Text>
              </Group>
            </>
          )}

          {registrationStep === 'error' && (
            <>
              <ThemeIcon size={64} radius="md" color="red" variant="light">
                <IconAlertCircle size={32} />
              </ThemeIcon>
              
              <Alert icon={<IconAlertCircle size={16} />} title="Connection Failed" color="red">
                {errorMessage}
              </Alert>
              
              <Group justify="center">
                <Text ta="center" size="sm" c="dimmed">
                  Please contact your team administrator for help.
                </Text>
              </Group>
            </>
          )}

          {validateToken.isSuccess && validateToken.data?.expiresAt && (
            <Text ta="center" size="xs" c="dimmed">
              <IconClock size={12} style={{ marginRight: 4 }} />
              Registration link expires: {new Date(validateToken.data.expiresAt).toLocaleString()}
            </Text>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}