"use client";
import { CreateProjectModal } from "./CreateProjectModal";
import { IconPlus } from "@tabler/icons-react";

export function ModernAddProjectButton() {
  return (
    <div className="mt-3 px-2">
      <CreateProjectModal>
        <button className="group w-full flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-gray-400 border border-dashed border-gray-700 transition-all duration-200 hover:border-gray-600 hover:text-gray-300 hover:bg-gray-800/30">
          <IconPlus className="w-4 h-4 mr-2" />
          <span>New project</span>
        </button>
      </CreateProjectModal>
    </div>
  );
}