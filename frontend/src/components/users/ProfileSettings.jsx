/**
 * @file frontend/src/components/users/ProfileSettings.jsx
 * @description Self-service profile settings — editable personal info, password change with current/new/confirm fields, profile image upload with preview
 * @author Dev B
 *
 * Endpoint coverage at the time of writing:
 *   - PUT /api/users/profile      → personal info ✅ (implemented)
 *   - PUT /api/auth/password      → password change ⚠ (controller stub
 *     not yet shipped; submitting will surface a 404 toast until the
 *     endpoint lands)
 *   - PUT /api/users/profile/image → profile image upload ⚠ (same status)
 *
 * The form is wired to call the canonical endpoint paths so a future
 * backend commit instantly enables the feature with no UI changes.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import axiosInstance from '../../api/axiosInstance';
import {
  isNonEmptyString,
  isValidPhoneNumber,
  isStrongPassword,
  passwordStrengthReason,
  passwordStrengthScore,
} from '../../utils/validators';
import { capitalizeFirst } from '../../utils/formatters';
import { useToast } from '../common/Toast';

/** Strength-meter color classes per score bucket. */
const STRENGTH_TONES = [
  { label: 'Empty',  bar: 'bg-gray-200',    text: 'text-gray-500' },
  { label: 'Weak',   bar: 'bg-rose-500',    text: 'text-rose-700' },
  { label: 'Weak',   bar: 'bg-rose-500',    text: 'text-rose-700' },
  { label: 'Fair',   bar: 'bg-amber-500',   text: 'text-amber-700' },
  { label: 'Good',   bar: 'bg-emerald-500', text: 'text-emerald-700' },
  { label: 'Strong', bar: 'bg-emerald-600', text: 'text-emerald-800' },
];

/** Accepted image MIME types for the avatar upload. */
const ACCEPTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Max avatar file size — 2 MB; anything bigger is silly for a 9rem circle. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Format a byte count as KB / MB. */
const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

/**
 * ProfileSettings — three stacked sub-forms:
 *   1. Personal info (first_name, last_name, phone)
 *   2. Profile image upload with preview
 *   3. Password change (current + new + confirm)
 *
 * Each section submits independently so a partial save on one doesn't
 * affect the others. Initial values come from `user` (typically the
 * AuthContext payload). Successful saves call `onSaved(updatedUser)` so
 * the parent can refresh the auth context.
 *
 * @param {Object} props
 * @param {Object} props.user - The authenticated user
 * @param {Function} [props.onSaved] - Called with the updated user after
 *   a successful personal-info or avatar save
 * @returns {JSX.Element}
 */
const ProfileSettings = ({ user, onSaved }) => {
  /* ── Personal info ──────────────────────────────────────────────── */
  const [info, setInfo] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  });
  const [infoErrors, setInfoErrors] = useState({});
  const [savingInfo, setSavingInfo] = useState(false);

  /* ── Avatar upload ──────────────────────────────────────────────── */
  const fileInputRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(user?.profile_image || null);
  const [imageError, setImageError] = useState(null);
  const [savingImage, setSavingImage] = useState(false);

  /* ── Password change ────────────────────────────────────────────── */
  const [pw, setPw] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  const { addToast } = useToast();

  /** Re-seed form state when the parent supplies a new user object. */
  useEffect(() => {
    setInfo({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      phone: user?.phone || '',
    });
    if (!imageFile) setImagePreview(user?.profile_image || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.first_name, user?.last_name, user?.phone, user?.profile_image]);

  /** Clean up object URLs on unmount / file swap to avoid memory leaks. */
  useEffect(() => {
    if (!imageFile) return undefined;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  /** User initials for the avatar fallback. */
  const initials = useMemo(() => {
    const a = (user?.first_name?.[0] || '').toUpperCase();
    const b = (user?.last_name?.[0] || '').toUpperCase();
    return `${a}${b}` || '?';
  }, [user?.first_name, user?.last_name]);

  /* ── Personal info submit ───────────────────────────────────────── */

  const validateInfo = () => {
    const errs = {};
    if (!isNonEmptyString(info.first_name)) errs.first_name = 'First name is required';
    if (!isNonEmptyString(info.last_name)) errs.last_name = 'Last name is required';
    if (info.phone && !isValidPhoneNumber(info.phone)) {
      errs.phone = 'Enter a valid phone number';
    }
    return errs;
  };

  const handleInfoChange = (field) => (event) => {
    const value = event.target.value;
    setInfo((prev) => ({ ...prev, [field]: value }));
    if (infoErrors[field]) {
      setInfoErrors((prev) => {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleInfoSubmit = async (event) => {
    event.preventDefault();
    const errs = validateInfo();
    setInfoErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingInfo(true);
    try {
      const { data } = await axiosInstance.put('/users/profile', {
        first_name: info.first_name.trim(),
        last_name: info.last_name.trim(),
        phone: info.phone?.trim() || null,
      });
      addToast('Profile updated', 'success');
      onSaved?.(data?.data?.user);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile';
      addToast(msg, 'error');
    } finally {
      setSavingInfo(false);
    }
  };

  /* ── Avatar handlers ────────────────────────────────────────────── */

  const validateImage = (file) => {
    if (!file) return null;
    if (!ACCEPTED_IMAGE_MIME.has(file.type)) {
      return 'Image must be JPG, PNG, WebP, or GIF';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `Image is too large (${formatBytes(file.size)} — max 2 MB)`;
    }
    return null;
  };

  const handleImagePick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      setImageFile(null);
      setImageError(error);
      return;
    }
    setImageError(null);
    setImageFile(file);
    // The useEffect above creates the object URL.
    event.target.value = '';
  };

  const handleImageReset = () => {
    setImageFile(null);
    setImageError(null);
    setImagePreview(user?.profile_image || null);
  };

  const handleImageUpload = async () => {
    if (!imageFile) return;
    setSavingImage(true);
    try {
      const form = new FormData();
      form.append('image', imageFile);
      const { data } = await axiosInstance.put(
        '/users/profile/image',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      addToast('Avatar updated', 'success');
      setImageFile(null);
      onSaved?.(data?.data?.user);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload avatar';
      addToast(msg, 'error');
    } finally {
      setSavingImage(false);
    }
  };

  /* ── Password change ────────────────────────────────────────────── */

  const pwScore = passwordStrengthScore(pw.new_password);
  const pwTone = STRENGTH_TONES[pwScore] || STRENGTH_TONES[0];

  const validatePassword = () => {
    const errs = {};
    if (!isNonEmptyString(pw.current_password)) {
      errs.current_password = 'Enter your current password';
    }
    if (!isStrongPassword(pw.new_password)) {
      errs.new_password =
        passwordStrengthReason(pw.new_password) ||
        'New password does not meet strength requirements';
    } else if (pw.new_password === pw.current_password) {
      errs.new_password = 'New password must be different from the current one';
    }
    if (pw.new_password !== pw.confirm_password) {
      errs.confirm_password = "Passwords don't match";
    }
    return errs;
  };

  const handlePwChange = (field) => (event) => {
    const value = event.target.value;
    setPw((prev) => ({ ...prev, [field]: value }));
    if (pwErrors[field]) {
      setPwErrors((prev) => {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      });
    }
  };

  const handlePwSubmit = async (event) => {
    event.preventDefault();
    const errs = validatePassword();
    setPwErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingPw(true);
    try {
      await axiosInstance.put('/auth/password', {
        current_password: pw.current_password,
        new_password: pw.new_password,
      });
      addToast('Password changed — sign in again on other devices', 'success');
      setPw({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.status === 401
          ? 'Current password is incorrect'
          : 'Failed to change password');
      addToast(msg, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Personal info card ─────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Personal information
          </h2>
          <p className="text-xs text-gray-500">
            Used across HRMS for emails, mentions, and audit attribution.
          </p>
        </header>

        <form onSubmit={handleInfoSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-first-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                First name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="profile-first-name"
                value={info.first_name}
                onChange={handleInfoChange('first_name')}
                maxLength={100}
                className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                  infoErrors.first_name
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
              />
              {infoErrors.first_name && (
                <p className="mt-1 text-xs text-red-600">
                  {infoErrors.first_name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="profile-last-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Last name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="profile-last-name"
                value={info.last_name}
                onChange={handleInfoChange('last_name')}
                maxLength={100}
                className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                  infoErrors.last_name
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
              />
              {infoErrors.last_name && (
                <p className="mt-1 text-xs text-red-600">
                  {infoErrors.last_name}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-phone"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Phone <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <input
              type="tel"
              id="profile-phone"
              value={info.phone}
              onChange={handleInfoChange('phone')}
              placeholder="+383 44 123 456"
              autoComplete="tel"
              className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                infoErrors.phone
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
            />
            {infoErrors.phone && (
              <p className="mt-1 text-xs text-red-600">{infoErrors.phone}</p>
            )}
          </div>

          {/* Read-only fields the user can't change here */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Email
              </p>
              <p className="mt-0.5 text-sm text-gray-900 font-mono break-all">
                {user?.email || '—'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Email changes need an admin via the Users page.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Roles
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {(user?.roles || []).map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                  >
                    {capitalizeFirst(r)}
                  </span>
                ))}
                {(user?.roles || []).length === 0 && (
                  <span className="text-sm text-gray-500">No roles</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={savingInfo}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {savingInfo ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Avatar card ────────────────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Profile photo
          </h2>
          <p className="text-xs text-gray-500">
            Shown next to your name in lists and notifications. JPG, PNG,
            WebP, or GIF — max 2 MB.
          </p>
        </header>

        <div className="flex items-start gap-5 flex-wrap">
          {/* Preview */}
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-2xl font-semibold overflow-hidden ring-4 ring-white shadow">
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Profile preview"
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {/* Controls */}
          <div className="flex-1 space-y-3 min-w-[14rem]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImagePick}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Choose image
              </button>
              {imageFile && (
                <>
                  <button
                    type="button"
                    onClick={handleImageUpload}
                    disabled={savingImage}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingImage ? 'Uploading…' : 'Upload'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImageReset}
                    disabled={savingImage}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
            {imageFile && (
              <p className="text-xs text-gray-500">
                {imageFile.name} · {formatBytes(imageFile.size)}
              </p>
            )}
            {imageError && (
              <p className="text-xs text-red-600">{imageError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Password change card ───────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Change password
          </h2>
          <p className="text-xs text-gray-500">
            Choose a new password with at least 8 characters, including
            upper- and lowercase letters, a number, and a special character.
          </p>
        </header>

        <form onSubmit={handlePwSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="profile-current-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Current password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              id="profile-current-password"
              value={pw.current_password}
              onChange={handlePwChange('current_password')}
              autoComplete="current-password"
              className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                pwErrors.current_password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300'
              }`}
            />
            {pwErrors.current_password && (
              <p className="mt-1 text-xs text-red-600">
                {pwErrors.current_password}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-new-password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                New password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="profile-new-password"
                value={pw.new_password}
                onChange={handlePwChange('new_password')}
                autoComplete="new-password"
                className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                  pwErrors.new_password
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
              />
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`${pwTone.bar} h-1.5 rounded-full transition-all`}
                    style={{ width: `${(pwScore / 5) * 100}%` }}
                  />
                </div>
                <span className={`text-[10px] font-medium ${pwTone.text}`}>
                  {pwTone.label}
                </span>
              </div>
              {pwErrors.new_password && (
                <p className="mt-1 text-xs text-red-600">
                  {pwErrors.new_password}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="profile-confirm-password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm new password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="profile-confirm-password"
                value={pw.confirm_password}
                onChange={handlePwChange('confirm_password')}
                autoComplete="new-password"
                className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                  pwErrors.confirm_password
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                }`}
              />
              {pwErrors.confirm_password && (
                <p className="mt-1 text-xs text-red-600">
                  {pwErrors.confirm_password}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={savingPw}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {savingPw ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProfileSettings;
