import {
  PROJECT_PALETTE_SIZE,
  projectColorIndexFor,
} from "~/lib/actions/projectColor";
import styles from "./ProjectChip.module.css";

interface ProjectChipProps {
  projectId: string | null | undefined;
  projectName: string;
}

const variantClass = [
  styles.proj0,
  styles.proj1,
  styles.proj2,
  styles.proj3,
  styles.proj4,
  styles.proj5,
  styles.proj6,
  styles.proj7,
  styles.proj8,
  styles.proj9,
];

export function ProjectChip({ projectId, projectName }: ProjectChipProps) {
  const idx = projectColorIndexFor(projectId) % PROJECT_PALETTE_SIZE;
  const variant = variantClass[idx] ?? "";
  return <span className={`${styles.chip} ${variant}`}>{projectName}</span>;
}
