"use client";
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { useState } from "react";
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Checkbox,
  Textarea,
  Group,
  Stack,
  ThemeIcon,
  Combobox,
  InputBase,
  useCombobox,
} from "@mantine/core";
// Removed deprecated @mantine/styles import
import {
  IconRocket,
  IconBulb,
  IconUsers,
  IconArrowRight,
  IconCheck,
  IconDownload,
} from "@tabler/icons-react";
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
  description?: string;
}

interface Audience {
  value: string;
  label: string;
  description?: string;
}

// Styles removed - @mantine/styles is deprecated in v7

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
  const [differentiatorSearch, setDifferentiatorSearch] = useState("");
  const { data: differentiators = [] } =
    api.workflow.getAllDifferentiators.useQuery();
  const { data: audiences = [] } = api.workflow.getAllAudiences.useQuery();
  const utils = api.useContext();
  const createDifferentiator = api.workflow.createDifferentiator.useMutation({
    onSuccess: () => {
      void utils.workflow.getAllDifferentiators.invalidate();
    },
  });
  const createAudience = api.workflow.createAudience.useMutation({
    onSuccess: () => {
      void utils.workflow.getAllAudiences.invalidate();
    },
  });
  const [taglines, setTaglines] = useState<string[]>([]);
  const [expandedDifferentiators, setExpandedDifferentiators] = useState<
    Differentiator[]
  >([]);
  const [expandedAudiences, setExpandedAudiences] = useState<Audience[]>([]);
  const [generatedPlan, setGeneratedPlan] = useState<{
    project: { name: string; description: string };
    outcome: { description: string; type: string; dueDate: string };
    weeklyGoals: Array<{
      week: number;
      title: string;
      description: string;
    }>;
    actions: Array<{
      name: string;
      description: string;
      dueDate: string;
      priority: "High" | "Medium" | "Low";
      week: number;
    }>;
  } | null>(null);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const differentiatorCombobox = useCombobox({
    onDropdownClose: () => differentiatorCombobox.resetSelectedOption(),
  });

  const generateLaunchPlan = api.workflow.generateLaunchPlan.useMutation({
    onSuccess: (data) => {
      console.log("generateLaunchPlan data ", data);
      setGeneratedPlan(data.plan);
      setStep(4);
      setIsSubmitting(false);
    },
    onError: (error) => {
      setIsSubmitting(false);
      console.error("Failed to generate launch plan:", error);
    },
  });

  const saveLaunchPlan = api.workflow.saveLaunchPlan.useMutation({
    onSuccess: (data) => {
      if (!data || !data.projects?.[0]?.slug) {
        console.error("Invalid response from saveLaunchPlan:", data);
        return;
      }
      router.push(`/projects/${data.projects[0].slug}-${data.projects[0].id}`);
    },
    onError: (error) => {
      setIsSubmitting(false);
      console.error("Failed to save launch plan:", error);
    },
  });

  const suggestDifferentiatorsAndAudience =
    api.workflow.suggestDifferentiatorsAndAudience.useMutation({
      onSuccess: (data) => {
        console.log("suggestDifferentiatorsAndAudience data ", data);
        // Find matching differentiators from the database based on labels
        const matchedDifferentiators = data.differentiators.map(
          (suggestion) => {
            const existingDiff = differentiators.find(
              (d) => d.label === suggestion.label,
            );
            if (existingDiff) {
              return {
                ...existingDiff,
                description: suggestion.description,
              };
            }
            return suggestion;
          },
        );

        // Find matching audiences from the database based on labels
        const matchedAudiences = data.audiences.map((suggestion) => {
          const existingAud = audiences.find(
            (a) => a.label === suggestion.label,
          );
          if (existingAud) {
            return {
              ...existingAud,
              description: suggestion.description,
            };
          }
          return {
            value: `${suggestion.label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
            label: suggestion.label,
            description: suggestion.description,
          };
        });

        setFormData((prev) => ({
          ...prev,
          differentiators: matchedDifferentiators.map((d) => d.value),
          audience: matchedAudiences.map((a) => a.value),
        }));
        setExpandedDifferentiators(matchedDifferentiators);
        setExpandedAudiences(matchedAudiences);
        setTaglines(data.taglines);
        setIsLoadingSuggestions(false);
        setShowDifferentiators(true);
        setShowAudience(true);
      },
      onError: (error) => {
        console.error(
          "Failed to suggest differentiators and audiences:",
          error,
        );
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

  const handleSavePlan = async () => {
    if (!generatedPlan) {
      notifications.show({
        title: 'Error',
        message: 'No plan to save',
        color: 'red'
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await saveLaunchPlan.mutateAsync({
        plan: generatedPlan,
      });
      notifications.show({
        title: 'Success',
        message: 'Launch plan saved successfully!',
        color: 'green'
      });
    } catch (error) {
      console.error("Failed to save launch plan:", error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save launch plan',
        color: 'red'
      });
      setIsSubmitting(false);
    }
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
        return (
          formData.productDescription.length > 0 &&
          (!showDifferentiators || formData.differentiators.length > 0)
        );
      case 3:
        return !showAudience || formData.audience.length > 0;
      default:
        return false;
    }
  };

  const exactOptionMatch = audiences.some(
    (item) => item.label.toLowerCase() === audienceSearch.toLowerCase(),
  );
  const filteredOptions = exactOptionMatch
    ? audiences
    : audiences.filter((item) =>
        item.label.toLowerCase().includes(audienceSearch.toLowerCase().trim()),
      );

  const exactDifferentiatorMatch = differentiators.some(
    (item) => item.label.toLowerCase() === differentiatorSearch.toLowerCase(),
  );
  const filteredDifferentiators = exactDifferentiatorMatch
    ? differentiators
    : differentiators.filter((item) =>
        item.label
          .toLowerCase()
          .includes(differentiatorSearch.toLowerCase().trim()),
      );

  const handleDifferentiatorSubmit = async (val: string) => {
    if (val === "$create") {
      const newValue = differentiatorSearch.trim();
      if (!formData.differentiators.includes(newValue)) {
        const newDifferentiator = {
          value: `${newValue.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
          label: differentiatorSearch,
          description: "",
        };

        await createDifferentiator.mutateAsync(newDifferentiator);

        setFormData((prev) => ({
          ...prev,
          differentiators: [...prev.differentiators, newDifferentiator.value],
        }));
        setExpandedDifferentiators((prev) => [...prev, newDifferentiator]);
      }
    } else {
      if (!formData.differentiators.includes(val)) {
        const selectedDiff = differentiators.find((d) => d.value === val);
        if (selectedDiff) {
          setFormData((prev) => ({
            ...prev,
            differentiators: [...prev.differentiators, val],
          }));
          setExpandedDifferentiators((prev) => [...prev, selectedDiff]);
        }
      }
    }
    setDifferentiatorSearch("");
    differentiatorCombobox.closeDropdown();
  };

  const handleAudienceSubmit = async (val: string) => {
    if (val === "$create") {
      const newValue = audienceSearch.trim();
      if (!formData.audience.includes(newValue)) {
        const newAudience = {
          value: `${newValue.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
          label: audienceSearch,
          description: "",
          productDescription: formData.productDescription,
        };

        await createAudience.mutateAsync(newAudience);

        setFormData((prev) => ({
          ...prev,
          audience: [...prev.audience, newAudience.value],
        }));
        setExpandedAudiences((prev) => [...prev, newAudience]);
      }
    } else {
      if (!formData.audience.includes(val)) {
        const selectedAud = audiences.find((a) => a.value === val);
        if (selectedAud) {
          setFormData((prev) => ({
            ...prev,
            audience: [...prev.audience, val],
          }));
          setExpandedAudiences((prev) => [...prev, selectedAud]);
        }
      }
    }
    setAudienceSearch("");
    combobox.closeDropdown();
  };

  const handleSavePlanClick = () => {
    void handleSavePlan();
  };

  // Removed useStyles hook - deprecated in Mantine v7

  const confirmAndSave = () => {
    modals.openConfirmModal({
      title: 'Save Launch Plan',
      children: (
        <Text size="sm">
          This will create a new project with all the tasks and milestones from your launch plan. 
          You&apos;ll be able to track progress and update tasks from the project dashboard.
        </Text>
      ),
      labels: { confirm: 'Save Plan', cancel: 'Cancel' },
      onConfirm: handleSavePlanClick,
    });
  };

  return (
    <Container size="sm" py="xl" style={{ '@media print': { padding: '20px' } }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center"
      >
        <Title className="mb-4 bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-4xl font-bold text-transparent">
          Launch Sprint
        </Title>
        <Text c="dimmed" size="lg">
          Let&apos;s create a 3-week plan to launch your product successfully.
        </Text>
      </motion.div>

      <Card withBorder className="relative overflow-hidden">
        <div className="absolute left-0 top-0 h-1 w-full bg-gray-200">
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
                          console.log("formData 1 ", formData);
                        } else {
                          setFormData({
                            ...formData,
                            goals: formData.goals.filter(
                              (g) => g !== goal.value,
                            ),
                          });
                          console.log("formData 2 ", formData);
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
                  <Title order={3}>✨ Positioning & Messaging</Title>
                </Group>
                <Textarea
                  label="Product Description"
                  description="What problem does your product solve? What makes it unique?"
                  placeholder="e.g., A privacy-first task management app that helps solo entrepreneurs stay focused and productive..."
                  autosize
                  minRows={20}
                  rows={20}
                  value={formData.productDescription}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      productDescription: e.currentTarget.value,
                    });
                  }}
                />
                <AnimatePresence>
                  {showDifferentiators && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Stack gap="xl">
                        <Stack gap="xs">
                          <Title order={3}>Key Differentiators</Title>
                          <Text size="sm" c="dimmed">
                            What makes your product stand out? We&apos;ve
                            suggested some based on your description. Please add
                            or remove any differentiators that you think are not
                            relevant to your product.
                          </Text>

                          <Combobox
                            store={differentiatorCombobox}
                            onOptionSubmit={handleDifferentiatorSubmit}
                          >
                            <Combobox.Target>
                              <InputBase
                                rightSection={<Combobox.Chevron />}
                                value={differentiatorSearch}
                                onChange={(event) => {
                                  differentiatorCombobox.openDropdown();
                                  differentiatorCombobox.updateSelectedOptionIndex();
                                  setDifferentiatorSearch(
                                    event.currentTarget.value,
                                  );
                                }}
                                onClick={() =>
                                  differentiatorCombobox.openDropdown()
                                }
                                onFocus={() =>
                                  differentiatorCombobox.openDropdown()
                                }
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
                                  .filter(
                                    (item) =>
                                      !formData.differentiators.includes(
                                        item.value,
                                      ),
                                  )
                                  .map((item) => (
                                    <Combobox.Option
                                      value={item.value}
                                      key={item.value}
                                    >
                                      {item.label}
                                    </Combobox.Option>
                                  ))}
                                {!exactDifferentiatorMatch &&
                                  differentiatorSearch.trim().length > 0 && (
                                    <Combobox.Option
                                      value="$create"
                                      key="create"
                                    >
                                      + Create &quot;{differentiatorSearch}
                                      &quot;
                                    </Combobox.Option>
                                  )}
                              </Combobox.Options>
                            </Combobox.Dropdown>
                          </Combobox>

                          {formData.differentiators.length > 0 && (
                            <div className="mt-4 space-y-6">
                              {expandedDifferentiators.map((diff) => (
                                <Card key={diff.value} withBorder>
                                  <Stack gap="xs">
                                    <Group justify="space-between">
                                      <Text fw={500}>{diff.label}</Text>
                                      <Button
                                        variant="subtle"
                                        color="red"
                                        size="xs"
                                        onClick={() => {
                                          setFormData((prev) => ({
                                            ...prev,
                                            differentiators:
                                              prev.differentiators.filter(
                                                (d) => d !== diff.value,
                                              ),
                                          }));
                                          setExpandedDifferentiators((prev) =>
                                            prev.filter(
                                              (d) => d.value !== diff.value,
                                            ),
                                          );
                                        }}
                                      >
                                        Remove
                                    </Button>
                                    </Group>
                                    {diff.description && (
                                      <Text size="sm" c="dimmed">
                                        {diff.description}
                                      </Text>
                                    )}
                                  </Stack>
                                </Card>
                              ))}
                            </div>
                          )}
                        </Stack>

                        {taglines.length > 0 && (
                          <Stack gap="xs">
                            <Title order={3}>Suggested Taglines</Title>
                            <div className="space-y-2">
                              {taglines.map((tagline, index) => (
                                <Text
                                  key={index}
                                  size="lg"
                                  fw={500}
                                  className="italic"
                                >
                                  &quot;{tagline}&quot;
                                </Text>
                              ))}
                            </div>
                          </Stack>
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
                  <Title order={3}>🎯 Target Audience</Title>
                </Group>
                <Text c="dimmed" size="sm">
                  Who will be using your product? We&apos;ve suggested some
                  audiences based on your description. Please add or remove any
                  that don&apos;t align with your target market.
                </Text>

                <Combobox
                  store={combobox}
                  onOptionSubmit={handleAudienceSubmit}
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
                        .filter(
                          (item) => !formData.audience.includes(item.value),
                        )
                        .map((item) => (
                          <Combobox.Option value={item.value} key={item.value}>
                            {item.label}
                          </Combobox.Option>
                        ))}
                      {!exactOptionMatch &&
                        audienceSearch.trim().length > 0 && (
                          <Combobox.Option value="$create" key="create">
                            + Create &quot;{audienceSearch}&quot;
                          </Combobox.Option>
                        )}
                    </Combobox.Options>
                  </Combobox.Dropdown>
                </Combobox>

                {formData.audience.length > 0 && (
                  <div className="mt-4 space-y-6">
                    {expandedAudiences.map((aud) => (
                      <Card key={aud.value} withBorder>
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Text fw={500}>{aud.label}</Text>
                            <Button
                              variant="subtle"
                              color="red"
                              size="xs"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  audience: prev.audience.filter(
                                    (a) => a !== aud.value,
                                  ),
                                }));
                                setExpandedAudiences((prev) =>
                                  prev.filter((a) => a.value !== aud.value),
                                );
                              }}
                            >
                              Remove
                            </Button>
                          </Group>
                          {aud.description && (
                            <Text size="sm" c="dimmed">
                              {aud.description}
                            </Text>
                          )}
                        </Stack>
                      </Card>
                    ))}
                  </div>
                )}
              </Stack>
            </motion.div>
          )}

          {step === 4 && generatedPlan && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Stack gap="xl">
                <Title order={3}>📋 PART 3: Execution Plan (Lean Launch)</Title>

                <Text>
                  This is your 3-week tactical roadmap to get{" "}
                  {generatedPlan.project.name} from &quot;ready&quot; to in the
                  hands of early users with momentum, feedback, and visibility.
                </Text>

                <Stack gap="xl">
                  <Title order={4}>📅 Week-by-Week Plan</Title>

                  {[1, 2, 3].map((week) => {
                    const weekGoal = generatedPlan.weeklyGoals?.find(g => g.week === week);
                    const weekActions = generatedPlan.actions?.filter(
                      (a) => a.week === week,
                    ) ?? [];
                    return (
                      <Stack key={week} gap="md">
                        <Title order={5}>
                          📝 Week {week}: {weekGoal?.title ?? 'Planning Week'}
                        </Title>
                        <Text fw={500}>Goal: {weekGoal?.description ?? 'Set goals and plan tasks for this week'}</Text>
                        <Text fw={500}>Tasks:</Text>
                        <div className="ml-4 space-y-2">
                          {weekActions.map((action, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Checkbox readOnly className="mt-1" />
                              <Text size="sm">{action.name}</Text>
                            </div>
                          ))}
                          {weekActions.length === 0 && (
                            <Text size="sm" c="dimmed">No tasks planned for this week yet</Text>
                          )}
                        </div>
                      </Stack>
                    );
                  })}
                </Stack>

                <Group justify="flex-end" mt="xl" style={{ '@media print': { display: 'none' } }}>
                  <Button
                    variant="light"
                    onClick={() => setStep(3)}
                    disabled={isSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.print()}
                    leftSection={<IconDownload size={16} />}
                    disabled={isSubmitting}
                  >
                    Download PDF
                  </Button>
                  <Button
                    onClick={confirmAndSave}
                    loading={isSubmitting}
                    size="lg"
                    rightSection={isSubmitting ? null : <IconCheck size={16} />}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving Launch Plan..." : "Save Launch Plan"}
                  </Button>
                </Group>
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>

        <Group justify="flex-end" mt="xl">
          {step > 1 && step < 4 && (
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
              {step === 2 && !showDifferentiators
                ? "Analyze Description"
                : "Next"}
            </Button>
          ) : step === 3 ? (
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!canProceed()}
              rightSection={<IconArrowRight size={16} />}
            >
              Generate Launch Plan
            </Button>
          ) : null}
        </Group>
      </Card>
    </Container>
  );
}
