import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, inMemoryUserStore } from '../src/modules/auth/auth.service.js';
import { registerSchema } from '../src/modules/auth/auth.schemas.js';

test('Phase 1 Auth Suite: Registration & Password Hashing', async () => {
  inMemoryUserStore.clear();

  const input = {
    email: 'alex.finance@global.com',
    password: 'SecurePassword123!'
  };

  const validation = registerSchema.safeParse(input);
  assert.equal(validation.success, true, 'Valid password and email must pass schema validation');

  const { user, tokens } = await AuthService.register(input);
  assert.ok(user.id.startsWith('usr_'), 'User ID must follow prefixed tenant format');
  assert.equal(user.email, input.email);
  assert.ok(tokens.accessToken, 'Must generate JWT access token');
  assert.ok(tokens.refreshToken, 'Must generate JWT refresh token');

  // Verify password was securely hashed and not stored in plaintext
  const stored = inMemoryUserStore.get(user.id);
  assert.ok(stored, 'User must be stored in database registry');
  assert.notEqual(stored?.passwordHash, input.password, 'Password must never be stored in plaintext');
  assert.ok(stored?.passwordHash.startsWith('$2'), 'Password must be hashed with bcrypt salt');
});

test('Phase 1 Auth Suite: Duplicate Email Prevention', async () => {
  const duplicateInput = {
    email: 'alex.finance@global.com',
    password: 'AnotherPassword456!'
  };

  await assert.rejects(
    async () => AuthService.register(duplicateInput),
    /already exists/,
    'Registering duplicate email must be rejected'
  );
});

test('Phase 1 Auth Suite: Password Complexity Enforcement', () => {
  const weakPasswords = [
    'short',              // too short
    'alllowercase123!',   // no uppercase
    'ALLUPPERCASE123!',   // no lowercase
    'NoNumberSpecial!',   // no number
    'NoSpecialChar123'    // no special char
  ];

  for (const pw of weakPasswords) {
    const res = registerSchema.safeParse({ email: 'test@example.com', password: pw });
    assert.equal(res.success, false, `Weak password '${pw}' must be rejected by schema`);
  }
});

test('Phase 1 Auth Suite: Login & Token Verification', async () => {
  const credentials = {
    email: 'alex.finance@global.com',
    password: 'SecurePassword123!'
  };

  const loginResult = await AuthService.login(credentials);
  assert.ok(loginResult.tokens.accessToken, 'Login must issue new access token');

  // Verify Token Payload
  const verified = AuthService.verifyToken(loginResult.tokens.accessToken);
  assert.equal(verified.email, credentials.email);
  assert.equal(verified.sub, loginResult.user.id);
  assert.equal(verified.type, 'access');

  // Test Invalid Password
  await assert.rejects(
    async () => AuthService.login({ email: credentials.email, password: 'WrongPassword999!' }),
    /Invalid email or password credentials/,
    'Invalid password must be rejected'
  );
});
