"use client";
import { CreateProjectModal } from "./CreateProjectModal";
import { IconPlus } from "@tabler/icons-react";
export function AddProjectButton() {
  return (
    <CreateProjectModal>
      <button
        // onClick={open}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-300"
      >
        <IconPlus size={16} />
        <span>New project</span>
      </button>
    </CreateProjectModal>
    //   <div role="button" tabIndex={0} className="hover:text-gray-300 cursor-pointer">
    //     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    //       <line x1="12" y1="5" x2="12" y2="19"></line>
    //       <line x1="5" y1="12" x2="19" y2="12"></line>
    //     </svg>
    //   </div>
    //
  );
}
