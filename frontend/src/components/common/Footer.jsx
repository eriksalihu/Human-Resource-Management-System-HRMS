/**
 * @file frontend/src/components/common/Footer.jsx
 * @description Application footer with copyright, version, documentation links, and dark-mode styling
 * @author Dev B
 */

/**
 * App version. Reads from a Vite-injected env var so CI / release scripts
 * can stamp the deployed build, with a sensible local fallback.
 */
const APP_VERSION =
  import.meta?.env?.VITE_APP_VERSION || '1.0.0-dev';

/**
 * Footer link list. Internal anchors hit a future `/help` route; external
 * links land on the GitHub repository so demo viewers can read the source.
 *
 * Keeping the URL list in one place makes branding changes (e.g. swapping
 * the GitHub org or pointing docs at a new domain) a one-line edit.
 */
const FOOTER_LINKS = [
  {
    label: 'Documentation',
    href: 'https://github.com/eriksalihu/Human-Resource-Management-System-HRMS#readme',
    external: true,
  },
  {
    label: 'API reference',
    href: 'https://github.com/eriksalihu/Human-Resource-Management-System-HRMS/tree/main/backend',
    external: true,
  },
  {
    label: 'Source code',
    href: 'https://github.com/eriksalihu/Human-Resource-Management-System-HRMS',
    external: true,
  },
  {
    label: 'Help',
    href: '/help',
    external: false,
  },
];

/**
 * Footer — small horizontal bar pinned at the bottom of `MainLayout`.
 * Three sections: copyright, navigation links, version stamp.
 *
 * @returns {JSX.Element}
 */
const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="border-t bg-white text-gray-600 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-400 border-gray-200"
    >
      <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
        {/* Copyright */}
        <p className="order-2 sm:order-1">
          © {year}{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            HRMS
          </span>{' '}
          · UBT Kolegji project ·{' '}
          <span className="text-gray-500 dark:text-gray-500">
            All rights reserved.
          </span>
        </p>

        {/* Links */}
        <nav
          aria-label="Footer"
          className="order-1 sm:order-2 flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Version stamp */}
        <p
          className="order-3 font-mono text-[10px] text-gray-400 dark:text-gray-500"
          title={`HRMS frontend build ${APP_VERSION}`}
        >
          v{APP_VERSION}
        </p>
      </div>
    </footer>
  );
};

export default Footer;
