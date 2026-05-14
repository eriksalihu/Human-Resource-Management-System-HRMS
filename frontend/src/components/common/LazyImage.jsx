/**
 * @file frontend/src/components/common/LazyImage.jsx
 * @description Image component with viewport-aware lazy loading,
 *   skeleton placeholder, error fallback, and smooth fade-in.
 * @author Dev B
 *
 * Why a custom component instead of relying on `<img loading="lazy">`:
 *
 *   - Native `loading="lazy"` only fires when the image is "near" the
 *     viewport per browser heuristics — there's no way to widen the
 *     trigger band for content that scrolls fast, and no event fires
 *     before the load starts so we can't show a tailored placeholder.
 *   - We want a *skeleton* placeholder (pulsing gray block sized to the
 *     image's container), not the browser's blank frame.
 *   - We want graceful error handling (broken-image icon, retry button)
 *     when the URL 404s — common for stale `profile_image` URLs.
 *   - We want fade-in once the image actually decodes, so the page
 *     doesn't pop.
 *
 * Usage:
 *
 *   <LazyImage
 *     src={employee.profile_image}
 *     alt={`${employee.first_name} ${employee.last_name}`}
 *     className="h-20 w-20 rounded-full"
 *     fallback={<Initials first={...} last={...} />}
 *   />
 *
 * The wrapper element controls the size (callers pass `className` with
 * width/height utilities). The underlying `<img>` fills the wrapper via
 * `object-cover`, so swapping between LazyImage and a plain `<img>` is
 * a near-drop-in replacement.
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Read whether the runtime has IntersectionObserver. Older Safari (<12)
 * and JSDOM in unit tests don't — we fall back to "load immediately"
 * so the image still appears.
 */
const hasIntersectionObserver =
  typeof window !== 'undefined' && 'IntersectionObserver' in window;

/**
 * Default broken-image icon used when the load fails and the caller
 * didn't supply a custom `fallback`. Centered inside a muted background.
 */
const DefaultFallback = () => (
  <div
    className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400"
    aria-hidden="true"
  >
    <svg
      className="h-1/2 w-1/2 max-h-12 max-w-12"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  </div>
);

/**
 * LazyImage — viewport-aware image with skeleton + fade-in + fallback.
 *
 * @param {Object} props
 * @param {string} [props.src] - Image URL (no src → render fallback)
 * @param {string} [props.alt='']
 * @param {string} [props.className=''] - Sizing classes (h-/w-/rounded-)
 * @param {string} [props.rootMargin='100px'] - Observer pre-load buffer.
 *   Higher = start loading sooner before scroll reaches the image.
 * @param {React.ReactNode} [props.placeholder] - Custom skeleton; defaults
 *   to an animated gray pulse the size of the wrapper.
 * @param {React.ReactNode} [props.fallback] - Rendered when src is empty
 *   or the load failed. Defaults to a broken-image icon.
 * @param {string} [props.objectFit='cover'] - `object-fit` value.
 * @param {Function} [props.onLoad] - Forwarded native load handler.
 * @param {Function} [props.onError] - Forwarded native error handler.
 * @returns {JSX.Element}
 */
const LazyImage = ({
  src,
  alt = '',
  className = '',
  rootMargin = '100px',
  placeholder,
  fallback,
  objectFit = 'cover',
  onLoad,
  onError,
  ...rest
}) => {
  const wrapperRef = useRef(null);

  // Has the wrapper crossed the observer's threshold yet? Once true we
  // mount the <img>; before that, we render only the skeleton.
  const [inView, setInView] = useState(!hasIntersectionObserver);

  // 'idle' → 'loading' → 'loaded' | 'error'
  // The wrapper drives the skeleton/fade-in based on this status.
  const [status, setStatus] = useState('idle');

  /**
   * Observe the wrapper. Once it intersects the viewport (± rootMargin)
   * we set `inView` and disconnect — no need to keep listening.
   */
  useEffect(() => {
    if (inView || !hasIntersectionObserver) return undefined;
    const el = wrapperRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  /**
   * Reset status when src changes (re-render for a new image should
   * show the skeleton again, not flash the previous load state).
   */
  useEffect(() => {
    setStatus('idle');
  }, [src]);

  const handleLoad = (event) => {
    setStatus('loaded');
    if (onLoad) onLoad(event);
  };

  const handleError = (event) => {
    setStatus('error');
    if (onError) onError(event);
  };

  // No src at all — render the fallback immediately. Saves the
  // skeleton flash for the "no profile picture" case (very common).
  const hasSrc = Boolean(src);
  const showSkeleton = hasSrc && status !== 'loaded' && status !== 'error';
  const showFallback = !hasSrc || status === 'error';

  return (
    <div
      ref={wrapperRef}
      className={`relative overflow-hidden bg-gray-100 ${className}`}
      {...rest}
    >
      {/* Skeleton — visible while we're idle or the <img> is loading. */}
      {showSkeleton &&
        (placeholder ?? (
          <div
            className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
            aria-hidden="true"
          />
        ))}

      {/* Fallback — visible when src is empty or the load failed. */}
      {showFallback && (fallback ?? <DefaultFallback />)}

      {/* The real <img> only renders once the wrapper has entered the
          viewport. Browser native `loading="lazy"` is set as a belt-
          and-braces measure for cases where the observer fires very
          early but the bandwidth-saving feature can still kick in. */}
      {hasSrc && inView && status !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          onLoadStart={() => setStatus('loading')}
          className={`absolute inset-0 block h-full w-full transition-opacity duration-300 ease-out ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ objectFit }}
        />
      )}
    </div>
  );
};

export default LazyImage;
