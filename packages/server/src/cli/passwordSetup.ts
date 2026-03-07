import * as readline from 'node:readline';
import { AuthConfigService } from '../services/authConfigService.js';
import { AuthConfigError } from '@bmad-studio/shared';

/** 패스워드 확인 재시도 최대 횟수 */
const MAX_PASSWORD_RETRY = 3;

/**
 * 터미널에서 패스워드 입력 받기
 */
function promptPassword(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * 패스워드 입력 및 확인 (최대 3회 재시도)
 */
async function promptPasswordWithConfirmation(): Promise<string> {
  for (let attempt = 1; attempt <= MAX_PASSWORD_RETRY; attempt++) {
    const password = await promptPassword('Enter password: ');
    const confirm = await promptPassword('Confirm password: ');

    if (password === confirm) {
      return password;
    }

    const remaining = MAX_PASSWORD_RETRY - attempt;
    if (remaining > 0) {
      console.log(`Passwords do not match. ${remaining} attempt(s) remaining.`);
    }
  }

  console.error('Maximum retry attempts exceeded.');
  process.exit(1);
}

/**
 * 패스워드 재설정 (--reset-password 옵션)
 */
export async function resetPassword(): Promise<void> {
  const authConfig = new AuthConfigService();

  if (!authConfig.isPasswordConfigured()) {
    console.log('\nNo password is currently configured.');
    console.log('Please set your password (minimum 4 characters):\n');

    const password = await promptPasswordWithConfirmation();
    await authConfig.setPassword(password);
    console.log('\nPassword configured successfully!\n');
    return;
  }

  console.log('\nReset password for BMad Studio.\n');

  // Verify current password
  const currentPassword = await promptPassword('Enter current password: ');
  const isValid = await authConfig.verifyPassword(currentPassword);

  if (!isValid) {
    console.error('\nIncorrect password.\n');
    process.exit(1);
  }

  console.log('\nPlease set your new password (minimum 4 characters):\n');

  const newPassword = await promptPasswordWithConfirmation();

  try {
    await authConfig.resetPassword(newPassword);
    console.log('\nPassword reset successfully!\n');
  } catch (error) {
    if (error instanceof AuthConfigError) {
      console.error(`\nError: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
