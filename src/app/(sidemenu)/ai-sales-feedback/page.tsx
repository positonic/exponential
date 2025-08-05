'use client';

import { useState } from 'react';
import { Container, Title, Text, Stack, Paper, Group, Button, Textarea, Card, ThemeIcon, Rating, Select, Checkbox, Alert } from '@mantine/core';
import { IconMessageCircle, IconBulb, IconHeart, IconStar, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface FeedbackForm {
  overallRating: number;
  mostExciting: string;
  wouldUse: string;
  targetAudience: string;
  concerns: string;
  improvements: string;
  willingToPay: string;
  additionalThoughts: string;
  interests: string[];
}

export default function AISalesFeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackForm>({
    overallRating: 0,
    mostExciting: '',
    wouldUse: '',
    targetAudience: '',
    concerns: '',
    improvements: '',
    willingToPay: '',
    additionalThoughts: '',
    interests: []
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    // In a real implementation, this would send to your API
    console.log('Feedback submitted:', feedback);
    setSubmitted(true);
    notifications.show({
      title: 'Thank you!',
      message: 'Your feedback has been recorded. I really appreciate your input!',
      color: 'green',
      icon: <IconHeart size={16} />,
      autoClose: 5000,
    });
  };

  const handleInterestToggle = (interest: string) => {
    setFeedback(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  if (submitted) {
    return (
      <Container size="md" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder className="text-center">
          <ThemeIcon size="xl" variant="light" color="green" mx="auto" mb="md">
            <IconCheck size={32} />
          </ThemeIcon>
          <Title order={2} mb="md">Thank You!</Title>
          <Text size="lg" c="dimmed" mb="lg">
            Your feedback has been recorded. I really appreciate you taking the time to share your thoughts!
          </Text>
          <Button 
            component="a" 
            href="/ai-sales-demo"
            variant="gradient"
            gradient={{ from: 'violet', to: 'indigo' }}
          >
            Back to Demo
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div className="text-center">
          <Group justify="center" mb="md">
            <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'violet', to: 'indigo' }}>
              <IconMessageCircle size={28} />
            </ThemeIcon>
          </Group>
          <Title order={1} className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent text-3xl font-bold mb-4">
            Help Shape the Future
          </Title>
          <Text size="lg" c="dimmed" maw={500} mx="auto">
            I&apos;m building an AI-powered sales page builder and would love your honest feedback. 
            This will help me decide if it&apos;s worth pursuing!
          </Text>
        </div>

        {/* Quick Context */}
        <Alert icon={<IconBulb size={16} />} title="Quick Recap" color="blue" variant="light">
          You just saw a demo where AI creates professional sales pages through conversation, 
          analyzing your project data to automatically generate compelling content and case studies.
        </Alert>

        {/* Feedback Form */}
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Stack gap="lg">
            <Title order={3}>Your Honest Feedback</Title>

            {/* Overall Rating */}
            <div>
              <Text fw={500} mb="sm">Overall, how excited are you about this concept?</Text>
              <Group>
                <Rating
                  size="lg"
                  value={feedback.overallRating}
                  onChange={(value) => setFeedback(prev => ({ ...prev, overallRating: value }))}
                />
                <Text size="sm" c="dimmed">
                  {feedback.overallRating === 0 && "Click to rate"}
                  {feedback.overallRating === 1 && "Not interested"}
                  {feedback.overallRating === 2 && "Somewhat interesting"}
                  {feedback.overallRating === 3 && "Pretty cool"}
                  {feedback.overallRating === 4 && "Very excited!"}
                  {feedback.overallRating === 5 && "Take my money!"}
                </Text>
              </Group>
            </div>

            {/* Most Exciting */}
            <div>
              <Text fw={500} mb="sm">What&apos;s the most exciting part of this idea?</Text>
              <Textarea
                placeholder="The conversational AI, the automatic project analysis, the real-time updates..."
                value={feedback.mostExciting}
                onChange={(e) => setFeedback(prev => ({ ...prev, mostExciting: e.currentTarget.value }))}
                minRows={2}
              />
            </div>

            {/* Would Use */}
            <div>
              <Text fw={500} mb="sm">Would you personally use something like this?</Text>
              <Select
                placeholder="Select an option"
                value={feedback.wouldUse}
                onChange={(value) => setFeedback(prev => ({ ...prev, wouldUse: value || '' }))}
                data={[
                  { value: 'definitely', label: 'Definitely - I need this now!' },
                  { value: 'probably', label: 'Probably - seems useful' },
                  { value: 'maybe', label: 'Maybe - depends on execution' },
                  { value: 'unlikely', label: 'Unlikely - not for me' },
                  { value: 'never', label: 'Never - not interested' }
                ]}
              />
            </div>

            {/* Target Audience */}
            <div>
              <Text fw={500} mb="sm">Who do you think would benefit most from this?</Text>
              <Textarea
                placeholder="Freelancers, agencies, consultants, startups, small businesses..."
                value={feedback.targetAudience}
                onChange={(e) => setFeedback(prev => ({ ...prev, targetAudience: e.currentTarget.value }))}
                minRows={2}
              />
            </div>

            {/* Concerns */}
            <div>
              <Text fw={500} mb="sm">Any concerns or potential problems you see?</Text>
              <Textarea
                placeholder="AI quality, pricing, complexity, market fit..."
                value={feedback.concerns}
                onChange={(e) => setFeedback(prev => ({ ...prev, concerns: e.currentTarget.value }))}
                minRows={2}
              />
            </div>

            {/* Improvements */}
            <div>
              <Text fw={500} mb="sm">What would make this 10x better?</Text>
              <Textarea
                placeholder="Better templates, more integrations, team collaboration..."
                value={feedback.improvements}
                onChange={(e) => setFeedback(prev => ({ ...prev, improvements: e.currentTarget.value }))}
                minRows={2}
              />
            </div>

            {/* Willing to Pay */}
            <div>
              <Text fw={500} mb="sm">If this existed today, what would you pay monthly?</Text>
              <Select
                placeholder="Select a price range"
                value={feedback.willingToPay}
                onChange={(value) => setFeedback(prev => ({ ...prev, willingToPay: value || '' }))}
                data={[
                  { value: 'free-only', label: '$0 - Only if free' },
                  { value: '1-10', label: '$1-10 - Light usage' },
                  { value: '10-25', label: '$10-25 - Regular usage' },
                  { value: '25-50', label: '$25-50 - Heavy usage' },
                  { value: '50-100', label: '$50-100 - Business tool' },
                  { value: '100+', label: '$100+ - Enterprise solution' }
                ]}
              />
            </div>

            {/* Interest Areas */}
            <div>
              <Text fw={500} mb="sm">What other features would interest you? (Check all that apply)</Text>
              <Stack gap="xs">
                {[
                  'Custom domains for sales pages',
                  'A/B testing different page versions',
                  'Lead capture and CRM integration',
                  'Analytics and conversion tracking',
                  'Team collaboration features',
                  'White-label for agencies',
                  'Mobile app for on-the-go editing',
                  'Integration with design tools (Figma, etc.)'
                ].map((interest) => (
                  <Checkbox
                    key={interest}
                    label={interest}
                    checked={feedback.interests.includes(interest)}
                    onChange={() => handleInterestToggle(interest)}
                  />
                ))}
              </Stack>
            </div>

            {/* Additional Thoughts */}
            <div>
              <Text fw={500} mb="sm">Any other thoughts, ideas, or questions?</Text>
              <Textarea
                placeholder="Your honest thoughts help me build something people actually want..."
                value={feedback.additionalThoughts}
                onChange={(e) => setFeedback(prev => ({ ...prev, additionalThoughts: e.currentTarget.value }))}
                minRows={3}
              />
            </div>

            {/* Submit */}
            <Button
              size="lg"
              variant="gradient"
              gradient={{ from: 'violet', to: 'indigo' }}
              leftSection={<IconStar size={20} />}
              onClick={handleSubmit}
              fullWidth
            >
              Submit Feedback
            </Button>
          </Stack>
        </Paper>

        {/* Thank You Note */}
        <Card shadow="sm" p="md" radius="md" bg="dark.7" withBorder>
          <Text size="sm" ta="center" c="gray.3">
            🙏 Thank you for taking the time to provide thoughtful feedback. 
            Your input directly shapes what I build next!
          </Text>
        </Card>
      </Stack>
    </Container>
  );
}