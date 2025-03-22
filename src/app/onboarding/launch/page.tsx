"use client";

import { useState } from "react";
import { Container, Title, Text, Button, Card, Checkbox, TextInput, Textarea, MultiSelect, Group, Stack, ThemeIcon, Combobox, InputBase, useCombobox } from "@mantine/core";
import { IconRocket, IconBulb, IconUsers, IconArrowRight, IconCheck, IconX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

const launchGoals = [
  { value: "validate", label: "Validate my idea with real users" },
  { value: "launch", label: "Launch my MVP and get first users" },
  { value: "grow", label: "Grow my existing product" },
  { value: "monetize", label: "Start monetizing my product" },
];

interface Differentiator {
  value: string;
  label: string;
}

const defaultDifferentiators: Differentiator[] = [
  { value: "ai", label: "AI-Powered" },
  { value: "privacy", label: "Privacy-First" },
  { value: "opensource", label: "Open Source" },
  { value: "simple", label: "Simple & Easy to Use" },
  { value: "fast", label: "Fast & Performant" },
  { value: "customizable", label: "Highly Customizable" },
  { value: "integrated", label: "Well Integrated" },
  { value: "secure", label: "Enterprise-Grade Security" },
];

interface Audience {
  value: string;
  label: string;
}

const audiences: Audience[] = [
  { value: "developers", label: "Developers" },
  { value: "designers", label: "Designers" },
  { value: "founders", label: "Startup Founders" },
  { value: "marketers", label: "Marketers" },
  { value: "freelancers", label: "Freelancers" },
  { value: "enterprise", label: "Enterprise Teams" },
  { value: "creators", label: "Content Creators" },
  { value: "educators", label: "Educators" },
];

export default function LaunchSprintPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [showDifferentiators, setShowDifferentiators] = useState(false);
  const [showAudience, setShowAudience] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    goals: [] as string[],
    productDescription: "",
    differentiators: [] as string[],
    audience: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audienceSearch, setAudienceSearch] = useState("");
  const [availableAudiences, setAvailableAudiences] = useState(audiences);
  const [differentiatorSearch, setDifferentiatorSearch] = useState("");
  const [availableDifferentiators, setAvailableDifferentiators] = useState(defaultDifferentiators);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const differentiatorCombobox = useCombobox({
    onDropdownClose: () => differentiatorCombobox.resetSelectedOption(),
  });

  const generateLaunchPlan = api.workflow.generateLaunchPlan.useMutation({
    onSuccess: (data) => {
      setIsSubmitting(false);
      router.push(`/projects/${data.project.slug}`);
    },
    onError: (error) => {
      setIsSubmitting(false);
      console.error("Failed to generate launch plan:", error);
    },
  });

  const suggestDifferentiatorsAndAudience = api.workflow.suggestDifferentiatorsAndAudience.useMutation({
    onSuccess: (data) => {
      setFormData(prev => ({
        ...prev,
        differentiators: data.differentiators.map(d => {
          switch (d) {
            case "AI-Powered": return "ai";
            case "Privacy-First": return "privacy";
            case "Open Source": return "opensource";
            case "Simple & Easy to Use": return "simple";
            case "Fast & Performant": return "fast";
            case "Highly Customizable": return "customizable";
            case "Well Integrated": return "integrated";
            case "Enterprise-Grade Security": return "secure";
            default: return "";
          }
        }).filter(Boolean),
        audience: data.audiences.map(a => {
          switch (a) {
            case "Developers": return "developers";
            case "Designers": return "designers";
            case "Startup Founders": return "founders";
            case "Marketers": return "marketers";
            case "Freelancers": return "freelancers";
            case "Enterprise Teams": return "enterprise";
            case "Content Creators": return "creators";
            case "Educators": return "educators";
            default: return "";
          }
        }).filter(Boolean)
      }));
      setIsLoadingSuggestions(false);
      setShowDifferentiators(true);
      setShowAudience(true);
    },
    onError: (error) => {
      console.error("Failed to suggest differentiators and audiences:", error);
      setIsLoadingSuggestions(false);
      setShowDifferentiators(true);
      setShowAudience(true);
    },
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await generateLaunchPlan.mutateAsync({
      goals: formData.goals,
      productDescription: formData.productDescription,
      differentiators: formData.differentiators,
      audience: formData.audience,
    });
  };

  const handleNext = async () => {
    if (step === 2 && !showDifferentiators && formData.productDescription) {
      setIsLoadingSuggestions(true);
      await suggestDifferentiatorsAndAudience.mutateAsync({
        productDescription: formData.productDescription,
      });
    } else {
      setStep(step + 1);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.goals.length > 0;
      case 2:
        return formData.productDescription.length > 0 && 
          (!showDifferentiators || formData.differentiators.length > 0);
      case 3:
        return (!showAudience || formData.audience.length > 0);
      default:
        return false;
    }
  };

  const exactOptionMatch = availableAudiences.some((item) => item.label.toLowerCase() === audienceSearch.toLowerCase());
  const filteredOptions = exactOptionMatch
    ? availableAudiences
    : availableAudiences.filter((item) => 
        item.label.toLowerCase().includes(audienceSearch.toLowerCase().trim())
      );

  const exactDifferentiatorMatch = availableDifferentiators.some(
    (item) => item.label.toLowerCase() === differentiatorSearch.toLowerCase()
  );
  const filteredDifferentiators = exactDifferentiatorMatch
    ? availableDifferentiators
    : availableDifferentiators.filter((item) => 
        item.label.toLowerCase().includes(differentiatorSearch.toLowerCase().trim())
      );

  return (
    <Container size="sm" py="xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-8"
      >
        <Title className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent mb-4">
          Launch Sprint
        </Title>
        <Text c="dimmed" size="lg">
          Let's create a 3-week plan to launch your product successfully.
        </Text>
      </motion.div>

      <Card withBorder className="relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gray-200">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-400 to-indigo-400"
            initial={{ width: "0%" }}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Stack gap="md">
                <Group>
                  <ThemeIcon size={32} radius="xl" color="violet">
                    <IconRocket size={18} />
                  </ThemeIcon>
                  <Title order={3}>Select Your Goals</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  What do you want to achieve with this launch sprint?
                </Text>
                <div className="space-y-2">
                  {launchGoals.map((goal) => (
                    <Checkbox
                      key={goal.value}
                      label={goal.label}
                      checked={formData.goals.includes(goal.value)}
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setFormData({
                            ...formData,
                            goals: [...formData.goals, goal.value],
                          });
                          console.log('formData 1 ', formData);
                        } else {
                          setFormData({
                            ...formData,
                            goals: formData.goals.filter((g) => g !== goal.value),
                          });
                          console.log('formData 2 ', formData);
                        }
                      }}
                    />
                  ))}
                </div>
              </Stack>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Stack gap="md">
                <Group>
                  <ThemeIcon size={32} radius="xl" color="violet">
                    <IconBulb size={18} />
                  </ThemeIcon>
                  <Title order={3}>Describe Your Product</Title>
                </Group>
                <pre>{JSON.stringify(formData, null, 2)}</pre>
                <Textarea
                  label="Product Description"
                  description="What problem does your product solve? What makes it unique?"
                  placeholder="e.g., A privacy-first task management app that helps solo entrepreneurs stay focused and productive..."
                  minRows={20}
                  value={formData.productDescription}
                  onChange={(e) => {
                    setFormData({ ...formData, productDescription: e.currentTarget.value })
                  console.log('formData 3 ', formData);
                }
                  
                }
                />
                <AnimatePresence>
                  {showDifferentiators && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Stack gap="xs">
                        <Text fw={500}>Key Differentiators</Text>
                        <Text size="sm" c="dimmed">
                          What makes your product stand out? We've suggested some based on your description.
                        </Text>
                        
                        <Combobox
                          store={differentiatorCombobox}
                          onOptionSubmit={(val) => {
                            if (val === '$create') {
                              const newValue = differentiatorSearch.trim();
                              if (!formData.differentiators.includes(newValue)) {
                                const newDifferentiator = {
                                  value: `${newValue}-${Date.now()}`,
                                  label: differentiatorSearch
                                };
                                setAvailableDifferentiators((current) => [...current, newDifferentiator]);
                                setFormData(prev => ({
                                  ...prev,
                                  differentiators: [...prev.differentiators, newDifferentiator.value]
                                }));
                              }
                            } else {
                              if (!formData.differentiators.includes(val)) {
                                setFormData(prev => ({
                                  ...prev,
                                  differentiators: [...prev.differentiators, val]
                                }));
                              }
                            }
                            setDifferentiatorSearch("");
                            differentiatorCombobox.closeDropdown();
                          }}
                        >
                          <Combobox.Target>
                            <InputBase
                              rightSection={<Combobox.Chevron />}
                              value={differentiatorSearch}
                              onChange={(event) => {
                                differentiatorCombobox.openDropdown();
                                differentiatorCombobox.updateSelectedOptionIndex();
                                setDifferentiatorSearch(event.currentTarget.value);
                              }}
                              onClick={() => differentiatorCombobox.openDropdown()}
                              onFocus={() => differentiatorCombobox.openDropdown()}
                              onBlur={() => {
                                differentiatorCombobox.closeDropdown();
                                setDifferentiatorSearch("");
                              }}
                              placeholder="Type to search or create differentiator"
                              rightSectionPointerEvents="none"
                            />
                          </Combobox.Target>

                          <Combobox.Dropdown>
                            <Combobox.Options>
                              {filteredDifferentiators
                                .filter(item => !formData.differentiators.includes(item.value))
                                .map((item) => (
                                  <Combobox.Option value={item.value} key={item.value}>
                                    {item.label}
                                  </Combobox.Option>
                                ))}
                              {!exactDifferentiatorMatch && differentiatorSearch.trim().length > 0 && (
                                <Combobox.Option value="$create" key="create">
                                  + Create "{differentiatorSearch}"
                                </Combobox.Option>
                              )}
                            </Combobox.Options>
                          </Combobox.Dropdown>
                        </Combobox>

                        {formData.differentiators.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {formData.differentiators.map((diffValue) => {
                              const diff = availableDifferentiators.find(d => d.value === diffValue);
                              return diff ? (
                                <Button
                                  key={diff.value}
                                  variant="light"
                                  size="xs"
                                  rightSection={
                                    <IconX
                                      size={14}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFormData(prev => ({
                                          ...prev,
                                          differentiators: prev.differentiators.filter(d => d !== diffValue)
                                        }));
                                      }}
                                    />
                                  }
                                >
                                  {diff.label}
                                </Button>
                              ) : null;
                            })}
                          </div>
                        )}
                      </Stack>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Stack>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Stack gap="md">
                <Group>
                  <ThemeIcon size={32} radius="xl" color="violet">
                    <IconUsers size={18} />
                  </ThemeIcon>
                  <Title order={3}>Define Your Audience</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  Who will be using your product? Type to search or create new audience types.
                  <pre>{JSON.stringify(formData, null, 2)}</pre>
                </Text>
                <Combobox
                  store={combobox}
                  onOptionSubmit={(val) => {
                    if (val === '$create') {
                      const newValue = audienceSearch.toLowerCase();
                      if (!formData.audience.includes(newValue)) {
                        const newAudience = {
                          value: `${newValue}-${Date.now()}`,
                          label: audienceSearch
                        };
                        setAvailableAudiences((current) => [...current, newAudience]);
                        setFormData(prev => ({
                          ...prev,
                          audience: [...prev.audience, newAudience.value]
                        }));
                      }
                    } else {
                      if (!formData.audience.includes(val)) {
                        setFormData(prev => ({
                          ...prev,
                          audience: [...prev.audience, val]
                        }));
                      }
                    }
                    setAudienceSearch("");
                    combobox.closeDropdown();
                  }}
                >
                  <Combobox.Target>
                    <InputBase
                      rightSection={<Combobox.Chevron />}
                      value={audienceSearch}
                      onChange={(event) => {
                        combobox.openDropdown();
                        combobox.updateSelectedOptionIndex();
                        setAudienceSearch(event.currentTarget.value);
                      }}
                      onClick={() => combobox.openDropdown()}
                      onFocus={() => combobox.openDropdown()}
                      onBlur={() => {
                        combobox.closeDropdown();
                        setAudienceSearch("");
                      }}
                      placeholder="Type to search or create audience"
                      rightSectionPointerEvents="none"
                    />
                  </Combobox.Target>

                  <Combobox.Dropdown>
                    <Combobox.Options>
                      {filteredOptions
                        .filter(item => !formData.audience.includes(item.value))
                        .map((item) => (
                          <Combobox.Option value={item.value} key={item.value}>
                            {item.label}
                          </Combobox.Option>
                        ))}
                      {!exactOptionMatch && audienceSearch.trim().length > 0 && (
                        <Combobox.Option value="$create" key="create">+ Create "{audienceSearch}"</Combobox.Option>
                      )}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>

                {formData.audience.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.audience.map((audienceValue) => {
                      const audience = availableAudiences.find(a => a.value === audienceValue);
                      return audience ? (
                        <Button
                          key={audience.value}
                          variant="light"
                          size="xs"
                          rightSection={
                            <IconX
                              size={14}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFormData(prev => ({
                                  ...prev,
                                  audience: prev.audience.filter(a => a !== audienceValue)
                                }));
                              }}
                            />
                          }
                        >
                          {audience.label}
                        </Button>
                      ) : null;
                    })}
                  </div>
                )}
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>

        <Group justify="flex-end" mt="xl">
          {step > 1 && (
            <Button
              variant="light"
              onClick={() => {
                setStep(step - 1);
                if (step === 3) {
                  setShowDifferentiators(true);
                  setShowAudience(true);
                }
              }}
              disabled={isSubmitting || isLoadingSuggestions}
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isLoadingSuggestions}
              loading={isLoadingSuggestions}
              rightSection={<IconArrowRight size={16} />}
            >
              {step === 2 && !showDifferentiators ? "Analyze Description" : "Next"}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!canProceed()}
              rightSection={<IconCheck size={16} />}
            >
              Generate Launch Plan
            </Button>
          )}
        </Group>
      </Card>
    </Container>
  );
} 