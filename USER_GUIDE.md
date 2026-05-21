# HRMS User Guide

A walkthrough of the HR Management System for everyday users — HR staff, department managers, and employees.

> Screenshots referenced below are placeholders (`[screenshot: …]`) — replace them with captures from your deployment.

---

## Contents

1. [Getting started](#1-getting-started)
2. [The dashboard](#2-the-dashboard)
3. [Departments & positions](#3-departments--positions)
4. [Employees](#4-employees)
5. [Salaries & payroll](#5-salaries--payroll)
6. [Leave management](#6-leave-management)
7. [Attendance](#7-attendance)
8. [Performance reviews](#8-performance-reviews)
9. [Trainings](#9-trainings)
10. [Documents](#10-documents)
11. [Your profile & settings](#11-your-profile--settings)
12. [Roles & what you can do](#12-roles--what-you-can-do)
13. [FAQ](#13-faq)

---

## 1. Getting started

### Signing in
1. Open the app URL. You'll land on the **Sign in** page.
2. Enter your email and password, then **Sign in**.
3. Tick **Remember me** to keep your email pre-filled next time.

`[screenshot: login page]`

### Creating an account
New here? Click **Create an account**, fill in your name, email, and a password (min 8 characters, with an uppercase letter, a lowercase letter, and a number), then submit.

### Forgot your password?
1. On the sign-in page click **Forgot your password?**
2. Enter your email and submit — if an account exists, a reset link is emailed (valid for one hour).
3. Open the link, choose a new password (the strength meter guides you), and confirm. You'll be redirected to sign in.

`[screenshot: forgot/reset password]`

---

## 2. The dashboard

After signing in you arrive at the **Dashboard** — your at-a-glance overview:
- **KPI cards** — active employees, departments, pending leaves, today's attendance.
- **Charts** — headcount by department, attendance trends, and more.
- **Recent activity** — a live feed of what's happening across the system.

HR/Admin users also see payroll totals. Use the sidebar (☰ on mobile) to navigate between modules.

`[screenshot: dashboard]`

---

## 3. Departments & positions

**Departments** (HR/Admin)
- **Departments** in the sidebar → see all departments.
- **Add Department** → name, description, location, budget, and an optional manager.
- Click a department to view detail; **Edit** or **Delete** from there.

**Positions** (HR/Admin)
- Each position belongs to a department and has a level and salary range.
- Create positions before creating employees, since an employee is assigned to one.

`[screenshot: departments list]`

---

## 4. Employees

**Employees** in the sidebar lists everyone, with search and filters (department, status, contract type).

**Add an employee** (HR/Admin) — a guided 4-step wizard:
1. **User account** — pick the user this employee record links to.
2. **Position & department** — choose the department, then a position within it.
3. **Contract details** — hire date, contract type, optional direct manager.
4. **Review & submit** — confirm and create.

Other actions: **View** a profile, **Edit**, **Terminate**, and **Export CSV** to download the current list.

`[screenshot: employee wizard]`

---

## 5. Salaries & payroll

**Salaries** (HR/Admin)
- Add a salary record per employee per month: base pay, bonuses, deductions. **Net pay is calculated automatically.**
- **Generate payroll** creates records for everyone for a chosen month in one step.
- **Payroll report** shows a department breakdown and a year-over-year comparison.

`[screenshot: salary form with net preview]`

---

## 6. Leave management

**Leave Requests** in the sidebar.

**As an employee**
- **Request leave** → type (annual, sick, personal, …), start/end dates, and an optional reason. Overlapping dates are blocked. Your remaining balance per type is shown.

**As a manager / HR**
- The **Pending** queue lists requests awaiting a decision. **Approve** or **Reject** individually, or select several and act in bulk.

`[screenshot: leave approval]`

---

## 7. Attendance

**Attendance** in the sidebar.
- **Check in / Check out** to log your hours, or HR can add entries directly.
- Statuses: present, remote, late, half-day, absent.
- HR/Admin can view a **monthly report** and export it to CSV.

`[screenshot: attendance summary]`

---

## 8. Performance reviews

**Performance** in the sidebar.
- Managers/HR create reviews for a period with a rating (1–5), strengths, development areas, and objectives.
- Employees see reviews about themselves under **My reviews**.
- Managers get **team analytics** — average scores, top/bottom performers, and improvement areas.

---

## 9. Trainings

**Trainings** in the sidebar.
- Browse upcoming, ongoing, and completed sessions (list or calendar view).
- **Enroll** yourself (or HR enrolls others). **Withdraw** if plans change.
- After a completed training you can leave a **rating** and feedback.

---

## 10. Documents

**Documents** in the sidebar.
- Upload employee documents (contracts, ID cards, certificates, …).
- Allowed file types: **PDF, DOC(X), JPG, PNG**, up to **5 MB**. A preview and a character-limited rename are offered before upload.
- HR is alerted about documents nearing their expiry date.

`[screenshot: document upload]`

---

## 11. Your profile & settings

- Open the **user menu** (top-right) → **Profile** to update your name, phone, and avatar.
- Toggle **dark mode** from the navbar — your choice is remembered.
- **Logout** ends your session everywhere on this device.

A **session-timeout warning** appears before your session expires — choose **Stay signed in** to extend it.

---

## 12. Roles & what you can do

| Capability | Employee | Dept Manager | HR Manager | Admin |
|------------|:--------:|:------------:|:----------:|:-----:|
| View own profile / leave / attendance | ✅ | ✅ | ✅ | ✅ |
| Approve/reject leave (their team) | – | ✅ | ✅ | ✅ |
| Manage employees / departments / positions | – | – | ✅ | ✅ |
| Run payroll / view salaries | – | – | ✅ | ✅ |
| Create performance reviews | – | ✅ | ✅ | ✅ |
| Manage user accounts / delete departments | – | – | – | ✅ |

---

## 13. FAQ

**I was logged out unexpectedly.**
Sessions expire for security. You'll usually get a "Stay signed in" prompt first; if you miss it, just sign in again.

**Why can't I see the Salaries or Users menu?**
Those are restricted to HR/Admin. Your visible menu reflects your role.

**My password reset link doesn't work.**
Links expire after one hour and are single-use. Request a fresh one from **Forgot your password?**

**An upload was rejected.**
Check the file is a PDF/DOC(X)/JPG/PNG and under 5 MB.

**The page looks cramped on my phone.**
The app is responsive — tables switch to cards and the menu collapses behind the ☰ button on small screens.

**"Too many requests" appeared.**
You hit a rate limit (e.g. repeated failed logins). Wait for the countdown shown, then try again.
