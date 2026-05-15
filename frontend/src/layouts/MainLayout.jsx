/**
 * @file frontend/src/layouts/MainLayout.jsx
 * @description Authenticated app shell — Navbar + Sidebar + scrollable content + Footer, with mobile-first responsive sidebar collapse and dark mode
 * @author Dev B
 *
 * Behavior overview:
 *   - On wide screens (≥ lg) the sidebar is open by default and the main
 *     content gets a left margin equal to the sidebar's width
 *   - On smaller screens the sidebar is closed by default and slides in
 *     as an overlay (so it doesn't push the layout around). A backdrop
 *     covers the content while the overlay is visible — clicking it
 *     closes the menu.
 *   - The Navbar's hamburger toggles the sidebar; the same state powers
 *     both the desktop "shrink" and the mobile "slide" presentations.
 *   - Window resize is observed so a viewport that crosses the lg breakpoint
 *     gets its sidebar reset to the sensible default for that size.
 */

import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import Footer from '../components/common/Footer';

/** Tailwind `lg` breakpoint in pixels — kept in JS so the responsive logic
 * matches the CSS without forcing a media-query lookup. */
const LG_BREAKPOINT_PX = 1024;

/** Returns true when the viewport is at least `lg` wide. */
const isLgViewport = () =>
  typeof window !== 'undefined' && window.innerWidth >= LG_BREAKPOINT_PX;

/**
 * MainLayout — wraps every authenticated route. Renders the top navbar,
 * collapsible sidebar, scrollable content, and footer.
 *
 * @returns {JSX.Element}
 */
const MainLayout = () => {
  /** Sidebar open/closed. Default depends on initial viewport size. */
  const [sidebarOpen, setSidebarOpen] = useState(() => isLgViewport());
  const location = useLocation();

  /**
   * On viewport-crosses-breakpoint, reset to the sensible default so the
   * user doesn't end up stuck with a desktop sidebar overlapping a mobile
   * page (or vice-versa).
   *
   * Only fires when crossing the boundary — within a tier the user's
   * explicit toggle is preserved.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let wasLg = isLgViewport();
    const handler = () => {
      const nowLg = isLgViewport();
      if (nowLg !== wasLg) {
        wasLg = nowLg;
        setSidebarOpen(nowLg);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  /**
   * Auto-close the sidebar after a route change when we're below the lg
   * breakpoint — on mobile the overlay should dismiss as soon as the
   * user picks a menu item.
   */
  useEffect(() => {
    if (!isLgViewport()) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Top navbar (fixed) */}
      <Navbar onToggleSidebar={toggleSidebar} />

      {/* Mobile-only backdrop. Clicking dismisses the overlay sidebar. */}
      <button
        type="button"
        onClick={closeSidebar}
        aria-label="Close sidebar"
        aria-hidden={!sidebarOpen}
        tabIndex={sidebarOpen ? 0 : -1}
        className={`fixed inset-0 top-16 z-10 bg-black/40 transition-opacity duration-200 lg:hidden ${
          sidebarOpen
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Layout body — sidebar (fixed) + main column */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar — fixed-position, left-edge, sized by inner state.
            `onClose` is wired so a left-swipe gesture on mobile can
            dismiss the overlay without going through the backdrop. */}
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

        {/* Main column: content + footer. Margin shifts on lg when sidebar
            is open; on smaller screens the sidebar overlays so margin stays 0. */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-in-out ${
            sidebarOpen ? 'lg:ml-64' : 'lg:ml-0'
          }`}
        >
          {/* Scrollable content area. min-h ensures footer sits at the bottom
              even on short pages without forcing the page to scroll. */}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 min-h-[calc(100vh-4rem-3rem)] focus:outline-none"
          >
            <Outlet />
          </main>

          {/* Footer */}
          <Footer />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
