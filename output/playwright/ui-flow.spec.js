const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

const dismissSplashIfPresent = async page => {
  const splashRoot = page.locator('.splash-root');
  if (await splashRoot.isVisible({ timeout: 7000 }).catch(() => false)) {
    const continueButton = page.locator('.splash-arrow-btn');
    await continueButton.waitFor({ state: 'attached', timeout: 15000 });
    await continueButton.evaluate(el => el.click());
    await splashRoot.waitFor({ state: 'hidden', timeout: 15000 });
  }
};

test('UI flow smoke across Tutor and Teacher dashboards', async ({ page }) => {
  const dialogMessages = [];
  page.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });

  await test.step('Login page loads', async () => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await dismissSplashIfPresent(page);
    await expect(page.getByRole('button', { name: 'Staff Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tutor \/ Admin/i })).toBeVisible();
  });

  await test.step('Tutor login and core controls', async () => {
    await page.getByRole('button', { name: /Tutor \/ Admin/i }).click();
    await expect(page).toHaveURL(/\/tutor/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Today for Tutor' })).toBeVisible();
    await expect(page.getByLabel('Tutor global search and quick jump')).toBeVisible();

    const tutorViewName = `ui-smoke-tutor-${Date.now()}`;
    await page.getByLabel('Name for new saved tutor view').fill(tutorViewName);
    await page.getByRole('button', { name: 'Save View' }).click();
    const tutorSavedOption = page
      .locator('select[aria-label="Apply saved tutor view"] option')
      .filter({ hasText: tutorViewName });
    await expect(tutorSavedOption).toHaveCount(1);
    await page.selectOption('select[aria-label="Apply saved tutor view"]', { label: tutorViewName });
    await page.getByRole('button', { name: 'Delete View' }).click();
    await expect(tutorSavedOption).toHaveCount(0);
  });

  await test.step('Tutor students wizard and timeline', async () => {
    await page.locator('.dashboard-sidebar-item:has-text("Students")').click();

    const addStudentButton = page.getByRole('button', { name: 'Add Student' }).first();
    await expect(addStudentButton).toBeVisible();
    await addStudentButton.click();

    const studentModal = page.locator('.modal-content');
    await expect(studentModal.getByRole('heading', { name: 'Add Student' })).toBeVisible();
    await expect(studentModal.getByText(/Step 1 of 3:/)).toBeVisible();

    const suffix = Date.now();
    await studentModal.getByLabel('Student Name *').fill(`UI Smoke ${suffix}`);
    await studentModal.getByLabel('Email Address').fill(`ui.smoke.${suffix}@example.com`);
    await studentModal.getByRole('button', { name: 'Next' }).click();

    await expect(studentModal.getByText(/Step 2 of 3:/)).toBeVisible();
    await studentModal.getByLabel('Grade Level (4-9) *').fill('5');
    await studentModal.getByLabel('Age (9-16) *').fill('10');
    await studentModal.getByRole('button', { name: 'Next' }).click();

    await expect(studentModal.getByText(/Step 3 of 3:/)).toBeVisible();
    await expect(studentModal.getByText('Review Student Details')).toBeVisible();
    await studentModal.getByRole('button', { name: 'Cancel' }).click();

    const profileButtons = page.getByRole('button', { name: 'Profile' });
    if ((await profileButtons.count()) > 0) {
      await profileButtons.first().click();
      const profileModal = page.locator('.modal-content');
      await expect(profileModal.getByText(/Student Timeline \(/)).toBeVisible();
      await profileModal.getByRole('button', { name: 'Close', exact: true }).click();
    } else {
      console.log('SKIP: Profile timeline check skipped (no students listed).');
    }
  });

  await test.step('Tutor assign/schedule wizards and undo', async () => {
    const assignButton = page.getByRole('button', { name: 'Assign Lesson Wizard' });
    await expect(assignButton).toBeVisible();
    await assignButton.click();

    const assignModal = page.locator('.modal-content');
    await expect(assignModal.getByRole('heading', { name: 'Assign Lesson Wizard' })).toBeVisible();
    await expect(assignModal.getByText(/Step 1 of 3:/)).toBeVisible();

    const studentOptions = assignModal.locator('#assign-wizard-student option');
    const lessonOptions = assignModal.locator('#assign-wizard-lesson option');
    if ((await studentOptions.count()) > 1) {
      const studentValue = await studentOptions.nth(1).getAttribute('value');
      if (studentValue) {
        await assignModal.locator('#assign-wizard-student').selectOption(studentValue);
        await assignModal.getByRole('button', { name: 'Next' }).click();
        await expect(assignModal.getByText(/Step 2 of 3:/)).toBeVisible();

        if ((await lessonOptions.count()) > 1) {
          const lessonValue = await lessonOptions.nth(1).getAttribute('value');
          if (lessonValue) {
            await assignModal.locator('#assign-wizard-lesson').selectOption(lessonValue);
            await assignModal.getByRole('button', { name: 'Next' }).click();
            await expect(assignModal.getByText(/Step 3 of 3:/)).toBeVisible();
            await expect(assignModal.getByText('Confirm Lesson Assignment')).toBeVisible();
          }
        } else {
          console.log('SKIP: Assign lesson step 2 skipped (no lessons available).');
        }
      }
    } else {
      console.log('SKIP: Assign wizard deep steps skipped (no students available).');
    }
    await assignModal.getByRole('button', { name: 'Cancel' }).click();

    await page.locator('.dashboard-sidebar-item:has-text("Schedule")').click();
    await expect(page.getByRole('heading', { name: 'Session Schedule' })).toBeVisible();

    const addSessionButton = page.getByRole('button', { name: /Add session/i }).first();
    await addSessionButton.click();

    const scheduleModal = page.locator('.modal-content');
    await expect(scheduleModal.getByRole('heading', { name: 'Schedule Session' })).toBeVisible();
    await expect(scheduleModal.getByText(/Step 1 of 3:/)).toBeVisible();

    const scheduleStudentSelect = scheduleModal.locator('select').first();
    const scheduleStudentOptions = scheduleStudentSelect.locator('option');
    if ((await scheduleStudentOptions.count()) > 1) {
      const studentValue = await scheduleStudentOptions.nth(1).getAttribute('value');
      if (studentValue) {
        await scheduleStudentSelect.selectOption(studentValue);
      }
      await scheduleModal.getByRole('button', { name: 'Next' }).click();
      await expect(scheduleModal.getByText(/Step 2 of 3:/)).toBeVisible();
      await scheduleModal.getByRole('button', { name: 'Next' }).click();
      await expect(scheduleModal.getByText(/Step 3 of 3:/)).toBeVisible();
    } else {
      await scheduleModal.getByRole('button', { name: 'Next' }).click();
      await expect(scheduleModal.getByText('Choose a student to schedule.')).toBeVisible();
    }
    await scheduleModal.getByRole('button', { name: 'Cancel' }).click();

    await page.locator('.section-primary-actions select').first().selectOption('all');
    const deleteButtons = page.locator('table tbody').getByRole('button', { name: 'Delete' });
    if ((await deleteButtons.count()) > 0) {
      await deleteButtons.first().click();
      const undoToast = page.locator('.undo-toast');
      await expect(undoToast).toBeVisible();
      await undoToast.getByRole('button', { name: 'Undo' }).click();
      await expect(undoToast).toBeHidden();
    } else {
      console.log('SKIP: Undo toast check skipped (no sessions available to delete).');
    }
  });

  await test.step('Teacher login and core controls', async () => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await dismissSplashIfPresent(page);

    await page.getByRole('button', { name: /^Teacher\b/i }).click();
    await expect(page).toHaveURL(/\/teacher/, { timeout: 20000 });

    await expect(page.getByRole('heading', { name: 'Today for Teacher' })).toBeVisible();
    await expect(page.getByLabel('Teacher global search and quick jump')).toBeVisible();

    const teacherViewName = `ui-smoke-teacher-${Date.now()}`;
    await page.getByLabel('Name for new saved teacher view').fill(teacherViewName);
    await page.getByRole('button', { name: 'Save View' }).click();

    const teacherSavedOption = page
      .locator('select[aria-label="Apply saved teacher view"] option')
      .filter({ hasText: teacherViewName });
    await expect(teacherSavedOption).toHaveCount(1);
    await page.selectOption('select[aria-label="Apply saved teacher view"]', { label: teacherViewName });
    await page.getByRole('button', { name: 'Delete View' }).click();
    await expect(teacherSavedOption).toHaveCount(0);

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  if (dialogMessages.length) {
    console.log(`Dialogs seen during run: ${dialogMessages.join(' | ')}`);
  }
});
