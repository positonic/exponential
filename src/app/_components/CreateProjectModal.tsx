import { Modal, TextInput, Button, Group, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from "react";
import { api } from "~/trpc/react";
import { slugify } from "~/utils/slugify";
import { type RouterOutputs } from "~/trpc/react";

type Project = RouterOutputs["project"]["getAll"][0];
type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD";
type ProjectPriority = "NONE" | "LOW" | "MEDIUM" | "HIGH";

interface CreateProjectModalProps {
  children: React.ReactNode; // This will be our trigger element
}

export function CreateProjectModal({ children }: CreateProjectModalProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [projectName, setProjectName] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("ACTIVE");
  const [priority, setPriority] = useState<ProjectPriority>("NONE");
  const [progress, setProgress] = useState(0);
  const [, setSlug] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");

  const utils = api.useUtils();

  const createProject = api.project.create.useMutation({
    onMutate: async (newProject) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await utils.project.getAll.cancel();

      // Snapshot the previous value
      const previousProjects = utils.project.getAll.getData();

      // Optimistically update to the new value
      utils.project.getAll.setData(undefined, (old) => {
        const optimisticProject = {
          id: `temp-${Date.now()}`,
          name: newProject.name,
          slug: slugify(newProject.name),
          status: newProject.status,
          priority: newProject.priority,
          progress: newProject.progress,
          reviewDate: newProject.reviewDate,
          nextActionDate: newProject.nextActionDate,
          createdAt: new Date(),
          createdById: "", // Will be set by the server
          actions: [], // Empty array for new project
          outcomes: [], // Empty array for new project
        };
        return old ? [...old, optimisticProject] : [optimisticProject];
      });

      return { previousProjects };
    },
    onError: (err, newProject, context) => {
      // If the mutation fails, use the context we returned above
      if (context?.previousProjects) {
        utils.project.getAll.setData(undefined, context.previousProjects);
      }
    },
    onSettled: () => {
      // Sync with server once mutation has settled
      void utils.project.getAll.invalidate();
    },
    onSuccess: () => {
      setProjectName("");
      setStatus("ACTIVE");
      setPriority("NONE");
      setProgress(0);
      setSlug(slugify(projectName));
      setReviewDate("");
      setNextActionDate("");
      close();
    },
  });

  return (
    <>
      <div onClick={open}>
        {children}
      </div>

      <Modal 
        opened={opened} 
        onClose={close}
        size="lg"
        radius="md"
        padding="lg"
        styles={{
          header: { display: 'none' },
          body: { padding: 0 },
          content: {
            backgroundColor: '#262626',
            color: '#C1C2C5',
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createProject.mutate({
              name: projectName,
              status,
              priority,
              progress,
              reviewDate: reviewDate ? new Date(reviewDate) : null,
              nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
            });
          }}
          className="p-4"
        >
          <TextInput
            placeholder="Project name"
            variant="unstyled"
            size="xl"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            required
            styles={{
              input: {
                fontSize: '24px',
                color: '#C1C2C5',
                '&::placeholder': {
                  color: '#C1C2C5',
                },
              },
            }}
          />
          
          <Select
            data={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'ON_HOLD', label: 'On Hold' },
            ]}
            value={status}
            onChange={(value) => setStatus(value as ProjectStatus)}
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              dropdown: {
                backgroundColor: '#262626',
                borderColor: '#373A40',
                color: '#C1C2C5',
              },
            }}
          />

          <Select
            data={[
              { value: 'NONE', label: 'None' },
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
            ]}
            value={priority}
            onChange={(value) => setPriority(value as ProjectPriority)}
            required
            mt="md"
            styles={{
              input: {
                backgroundColor: '#262626',
                color: '#C1C2C5',
                borderColor: '#373A40',
              },
              dropdown: {
                backgroundColor: '#262626',
                borderColor: '#373A40',
                color: '#C1C2C5',
              },
            }}
          />

          {/* <TextInput
            type="date"
            label="Review Date"
            value={reviewDate}
            onChange={(e) => setReviewDate(e.target.value)}
            mt="md"
          /> */}

          {/* <TextInput
            type="date"
            label="Next Action Date"
            value={nextActionDate}
            onChange={(e) => setNextActionDate(e.target.value)}
            mt="md"
          /> */}

          <Group justify="flex-end" mt="xl">
            <Button variant="subtle" color="gray" onClick={close}>
              Cancel
            </Button>
            <Button 
              type="submit"
              loading={createProject.isPending}
            >
              Create Project
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
} 