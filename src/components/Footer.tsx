import React from "react";
import { NavLink } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-8 px-4 py-6 text-center text-sm">
      <div className="max-w-screen-sm mx-auto space-y-4">
        <nav className="flex justify-center gap-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `${isActive ? "text-brand" : "hover:text-brand"}`
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/education"
            className={({ isActive }) =>
              `${isActive ? "text-brand" : "hover:text-brand"}`
            }
          >
            Education
          </NavLink>
        </nav>
        <p className="opacity-70">&copy; {new Date().getFullYear()} Bitcoin Square</p>
      </div>
    </footer>
  );
}
