import { describe, it, expect } from 'vitest';
import path from 'path';
import { isReadOnlyPath } from '../src/services/filesystem.js';

// ── isReadOnlyPath ────────────────────────────────────────────────

describe('isReadOnlyPath', () => {
  const webRoot = '/home/user/Local Sites/mysite/app/public';

  // WordPress core directories should be read-only
  it('marks wp-admin/ as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin', 'index.php'), webRoot)).toBe(true);
  });

  it('marks wp-admin nested paths as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin', 'includes', 'class-wp-screen.php'), webRoot)).toBe(true);
  });

  it('marks wp-includes/ as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes', 'version.php'), webRoot)).toBe(true);
  });

  it('marks wp-includes nested paths as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes', 'rest-api', 'endpoints', 'class-wp-rest-posts-controller.php'), webRoot)).toBe(true);
  });

  // wp-content and other directories should be writable
  it('allows wp-content/themes/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'themes', 'mytheme', 'style.css'), webRoot)).toBe(false);
  });

  it('allows wp-content/plugins/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'plugins', 'myplugin', 'plugin.php'), webRoot)).toBe(false);
  });

  it('allows wp-content/uploads/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'uploads', '2024', '01', 'image.jpg'), webRoot)).toBe(false);
  });

  it('allows wp-config.php in webroot', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-config.php'), webRoot)).toBe(false);
  });

  it('allows .htaccess in webroot', () => {
    expect(isReadOnlyPath(path.join(webRoot, '.htaccess'), webRoot)).toBe(false);
  });

  it('allows wp-content/mu-plugins/', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-content', 'mu-plugins', 'custom.php'), webRoot)).toBe(false);
  });

  // Edge cases: files that start with "wp-admin" or "wp-includes" but aren't in those dirs
  it('allows a file named wp-admin-helper.php in webroot', () => {
    const filePath = path.join(webRoot, 'wp-admin-helper.php');
    expect(isReadOnlyPath(filePath, webRoot)).toBe(false);
  });

  it('allows a file named wp-includes-extra.php in webroot', () => {
    const filePath = path.join(webRoot, 'wp-includes-extra.php');
    expect(isReadOnlyPath(filePath, webRoot)).toBe(false);
  });

  it('marks the wp-admin directory itself as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-admin'), webRoot)).toBe(true);
  });

  it('marks the wp-includes directory itself as read-only', () => {
    expect(isReadOnlyPath(path.join(webRoot, 'wp-includes'), webRoot)).toBe(true);
  });
});
