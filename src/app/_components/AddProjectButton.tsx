"use client";
import { CreateProjectModal } from "./CreateProjectModal";
import { IconPlus } from "@tabler/icons-react";

export function AddProjectButton() {
  return (
    <div className="px-2 mt-2">
      <CreateProjectModal>
        <button className="group relative w-full flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-400 border-2 border-dashed border-gray-600/50 transition-all duration-300 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <IconPlus className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute inset-0 w-5 h-5 bg-blue-400/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="font-semibold">New project</span>
          </div>
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600/0 via-blue-500/5 to-purple-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </button>
      </CreateProjectModal>
    </div>
    //   <div role="button" tabIndex={0} className="hover:text-gray-300 cursor-pointer">
    //     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    //       <line x1="12" y1="5" x2="12" y2="19"></line>
    //       <line x1="5" y1="12" x2="19" y2="12"></line>
    //     </svg>
    //   </div>
    //
  );
}
