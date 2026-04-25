"use client";

import type { ReactNode } from "react";
import { Container, Text } from "@mantine/core";
import { ProjectViewTabs, type ProjectView } from "./ProjectViewTabs";

interface ProjectViewLayoutProps {
  activeView: ProjectView;
  title?: ReactNode;
  description?: ReactNode;
  tabsRightSection?: ReactNode;
  children: ReactNode;
}

export function ProjectViewLayout({
  activeView,
  title,
  description,
  tabsRightSection,
  children,
}: ProjectViewLayoutProps) {
  return (
    <Container size="xl" className="py-6">
      <div className="mb-2 min-h-[3.25rem]">
        {title && (
          typeof title === "string" ? (
            <Text size="xl" fw={600} className="text-text-primary">
              {title}
            </Text>
          ) : (
            title
          )
        )}
        {description && (
          typeof description === "string" ? (
            <Text size="sm" className="text-text-secondary">
              {description}
            </Text>
          ) : (
            description
          )
        )}
      </div>
      <ProjectViewTabs activeView={activeView} rightSection={tabsRightSection} />
      {children}
    </Container>
  );
}
