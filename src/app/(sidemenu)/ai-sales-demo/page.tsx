'use client';

import { useState } from 'react';
import { Container, Title, Text, Stack, Paper, Group, Button, Textarea, Card, Badge, ThemeIcon, Loader } from '@mantine/core';
import { IconSparkles, IconArrowRight, IconCheck, IconRocket, IconUsers, IconTrendingUp, IconMessageCircle, IconWand, IconEye } from '@tabler/icons-react';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface SalesPagePreview {
  headline: string;
  subheadline: string;
  features: string[];
  cta: string;
  testimonial?: string;
  metrics?: string;
}

export default function AISalesDemoPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content: "Hi! I'm your AI sales page assistant. I can see you have a project called 'Restaurant Order App' that increased orders by 40%. Should I create a sales page to help you win more restaurant clients?",
      timestamp: new Date()
    }
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [salesPage, setSalesPage] = useState<SalesPagePreview>({
    headline: "Increase Your Restaurant's Delivery Orders by 40% in 30 Days",
    subheadline: "Custom mobile apps that turn first-time customers into regulars, just like we did for Tony's Pizza.",
    features: [
      "🍕 Easy one-tap ordering that customers love",
      "📱 Custom branded mobile app for iOS & Android", 
      "📊 Real-time analytics to track growth",
      "🔄 Seamless integration with your POS system"
    ],
    cta: "Get Your Custom Restaurant App",
    testimonial: "\"Our delivery orders increased by 40% in the first month. The app is so easy to use, even our regular customers switched to ordering through it!\" - Tony, Tony's Pizza",
    metrics: "40% increase in orders • 500+ downloads in first month • 4.8★ app store rating"
  });

  const simulateAIResponse = (userMessage: string) => {
    setIsLoading(true);
    
    // Simulate AI processing delay
    setTimeout(() => {
      let aiResponse = '';
      const updatedPage = { ...salesPage };
      
      if (userMessage.toLowerCase().includes('more premium') || userMessage.toLowerCase().includes('expensive')) {
        aiResponse = "Perfect! I'm updating the page to target high-end restaurants. Notice how I changed the headline to focus on 'premium dining experience' and added luxury positioning.";
        updatedPage.headline = "Elevate Your Premium Restaurant with a Custom Mobile Experience";
        updatedPage.subheadline = "Exclusive mobile apps for discerning diners who expect seamless, sophisticated ordering.";
        updatedPage.cta = "Schedule Premium Consultation";
      } else if (userMessage.toLowerCase().includes('urgency') || userMessage.toLowerCase().includes('urgent')) {
        aiResponse = "Adding urgency! I've updated the headline and CTA to create FOMO. See how it now emphasizes limited availability and time-sensitive offers.";
        updatedPage.headline = "Only 3 Spots Left: Get Your 40% Order Boost This Month";
        updatedPage.cta = "Claim Your Spot Now (3 Left)";
      } else if (userMessage.toLowerCase().includes('social proof') || userMessage.toLowerCase().includes('testimonial')) {
        aiResponse = "Great idea! I'm adding more social proof. I've enhanced the testimonial section and added specific metrics that restaurants care about.";
        updatedPage.testimonial = "\"This app transformed our business. We went from 50 delivery orders per day to 85+ orders. ROI was positive in week 2!\" - Maria, Bella Vista Restaurant";
        updatedPage.metrics = "40% average order increase • 25+ restaurants served • $2M+ additional revenue generated";
      } else {
        aiResponse = "I understand! Let me refine the sales page based on your feedback. What specific aspect would you like me to focus on - the headline, pricing, or call-to-action?";
      }
      
      setMessages(prev => [...prev, {
        role: 'ai',
        content: aiResponse,
        timestamp: new Date()
      }]);
      
      setSalesPage(updatedPage);
      setIsLoading(false);
    }, 1500);
  };

  const handleSendMessage = () => {
    if (!currentInput.trim()) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: currentInput,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    simulateAIResponse(currentInput);
    setCurrentInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div className="text-center">
          <Group justify="center" mb="md">
            <ThemeIcon size="xl" variant="gradient" gradient={{ from: 'violet', to: 'indigo' }}>
              <IconWand size={28} />
            </ThemeIcon>
          </Group>
          <Title order={1} className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent text-4xl font-bold mb-4">
            AI Sales Page Studio
          </Title>
          <Text size="xl" c="dimmed" maw={600} mx="auto">
            Transform any project into a professional sales page in under 2 minutes. 
            Just describe what you want - the AI handles the rest.
          </Text>
        </div>

        {/* Main Demo Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Chat Interface */}
          <div>
            <Paper shadow="sm" p="md" radius="md" withBorder className="h-[600px] flex flex-col">
              <Group mb="md">
                <ThemeIcon size="sm" variant="light" color="violet">
                  <IconMessageCircle size={16} />
                </ThemeIcon>
                <Text fw={600}>Conversation with AI</Text>
                <Badge variant="light" color="green" size="sm">Live Demo</Badge>
              </Group>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto mb-md">
                <Stack gap="sm">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <Paper
                        p="sm"
                        radius="md"
                        bg={message.role === 'user' ? 'blue.8' : 'dark.6'}
                        maw="80%"
                        className={message.role === 'user' ? 'text-blue-100' : 'text-gray-100'}
                      >
                        <Text size="sm" c={message.role === 'user' ? 'blue.1' : 'gray.1'}>
                          {message.content}
                        </Text>
                      </Paper>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <Paper p="sm" radius="md" bg="dark.6">
                        <Group gap="xs">
                          <Loader size="xs" />
                          <Text size="sm" c="gray.3">AI is thinking...</Text>
                        </Group>
                      </Paper>
                    </div>
                  )}
                </Stack>
              </div>
              
              {/* Input */}
              <Stack gap="sm">
                <Textarea
                  placeholder="Try: 'Make it more premium' or 'Add urgency' or 'Need more social proof'"
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.currentTarget.value)}
                  onKeyPress={handleKeyPress}
                  minRows={2}
                  maxRows={4}
                  disabled={isLoading}
                />
                <Group>
                  <Button
                    onClick={handleSendMessage}
                    disabled={!currentInput.trim() || isLoading}
                    leftSection={<IconArrowRight size={16} />}
                    variant="gradient"
                    gradient={{ from: 'violet', to: 'indigo' }}
                  >
                    Send
                  </Button>
                  <Text size="xs" c="dimmed">Press Enter to send</Text>
                </Group>
                
                {/* Quick Actions */}
                <Group gap="xs">
                  <Text size="xs" c="dimmed">Quick try:</Text>
                  <Button 
                    size="xs" 
                    variant="light" 
                    onClick={() => {
                      setCurrentInput('Make it more premium');
                      setTimeout(() => handleSendMessage(), 100);
                    }}
                  >
                    &ldquo;Make it premium&rdquo;
                  </Button>
                  <Button 
                    size="xs" 
                    variant="light"
                    onClick={() => {
                      setCurrentInput('Add urgency');
                      setTimeout(() => handleSendMessage(), 100);
                    }}
                  >
                    &ldquo;Add urgency&rdquo;
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </div>

          {/* Live Preview */}
          <div>
            <Paper shadow="sm" p="md" radius="md" withBorder className="h-[600px] overflow-y-auto">
              <Group mb="md">
                <ThemeIcon size="sm" variant="light" color="green">
                  <IconEye size={16} />
                </ThemeIcon>
                <Text fw={600}>Live Sales Page Preview</Text>
                <Badge variant="light" color="blue" size="sm">Updates in Real-Time</Badge>
              </Group>
              
              {/* Sales Page Preview */}
              <Stack gap="lg">
                {/* Hero Section */}
                <div className="text-center">
                  <Title order={2} className="text-2xl font-bold mb-2" c="gray.1">
                    {salesPage.headline}
                  </Title>
                  <Text size="lg" c="dimmed" maw={400} mx="auto">
                    {salesPage.subheadline}
                  </Text>
                </div>

                {/* Features */}
                <Card shadow="xs" p="md" radius="md">
                  <Text fw={600} mb="sm">What You Get:</Text>
                  <Stack gap="xs">
                    {salesPage.features.map((feature, index) => (
                      <Group key={index} gap="xs">
                        <ThemeIcon size="sm" variant="light" color="green">
                          <IconCheck size={12} />
                        </ThemeIcon>
                        <Text size="sm">{feature}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Card>

                {/* Testimonial */}
                {salesPage.testimonial && (
                  <Paper p="md" radius="md" bg="dark.7" withBorder>
                    <Text size="sm" style={{ fontStyle: 'italic' }} c="gray.2">
                      {salesPage.testimonial}
                    </Text>
                  </Paper>
                )}

                {/* Metrics */}
                {salesPage.metrics && (
                  <Group justify="center">
                    <Badge variant="light" color="blue" size="lg">
                      {salesPage.metrics}
                    </Badge>
                  </Group>
                )}

                {/* CTA */}
                <Button
                  size="lg"
                  fullWidth
                  variant="gradient"
                  gradient={{ from: 'orange', to: 'red' }}
                  leftSection={<IconRocket size={20} />}
                >
                  {salesPage.cta}
                </Button>
              </Stack>
            </Paper>
          </div>
        </div>

        {/* Value Props */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
            <ThemeIcon size="xl" variant="light" color="violet" mx="auto" mb="md">
              <IconSparkles size={28} />
            </ThemeIcon>
            <Title order={4} mb="sm">2-Minute Setup</Title>
            <Text size="sm" c="dimmed">
              From project to professional sales page faster than making coffee. 
              No design skills required.
            </Text>
          </Card>

          <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
            <ThemeIcon size="xl" variant="light" color="green" mx="auto" mb="md">
              <IconTrendingUp size={28} />
            </ThemeIcon>
            <Title order={4} mb="sm">Project Intelligence</Title>
            <Text size="sm" c="dimmed">
              AI analyzes your project results and automatically creates compelling 
              success stories and case studies.
            </Text>
          </Card>

          <Card shadow="sm" p="lg" radius="md" withBorder className="text-center">
            <ThemeIcon size="xl" variant="light" color="blue" mx="auto" mb="md">
              <IconUsers size={28} />
            </ThemeIcon>
            <Title order={4} mb="sm">Conversion Optimized</Title>
            <Text size="sm" c="dimmed">
              Every page follows proven psychology principles and industry best 
              practices for maximum conversions.
            </Text>
          </Card>
        </div>

        {/* Call to Action for Friends */}
        <Paper shadow="sm" p="xl" radius="md" withBorder className="text-center" bg="dark.8">
          <Title order={3} mb="md">Want to Try This for Real?</Title>
          <Text size="lg" c="dimmed" mb="lg" maw={600} mx="auto">
            This is a working prototype of an AI-powered sales page builder that learns from your actual projects. 
            I&apos;m looking for feedback from friends before building the full version.
          </Text>
          <Group justify="center">
            <Button
              component="a"
              href="/ai-sales-feedback"
              size="lg"
              variant="gradient"
              gradient={{ from: 'violet', to: 'indigo' }}
              leftSection={<IconMessageCircle size={20} />}
            >
              Give Feedback
            </Button>
            <Button
              component="a"
              href="/ai-sales-blog"
              size="lg"
              variant="outline"
              leftSection={<IconArrowRight size={20} />}
            >
              Read Full Vision
            </Button>
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}