import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function CMSLayout() {
  return (
    <div className="px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold mb-4">CMS</h1>
      <nav className="flex gap-3 mb-6">
        <NavLink to="/cms/lessons" className="px-3 py-1.5 rounded border dark:border-neutral-700">Lessons Editor</NavLink>
        <NavLink to="/cms/lessons/upload" className="px-3 py-1.5 rounded border dark:border-neutral-700">Lessons Upload</NavLink>
        <NavLink to="/cms/home" className="px-3 py-1.5 rounded border dark:border-neutral-700">Home Editor</NavLink>
        <NavLink to="/cms/newsletter" className="px-3 py-1.5 rounded border dark:border-neutral-700">Newsletter</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
