const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Rewrites any JitPack repository declarations to exclude com.stripe so Gradle
 * won't query JitPack for Stripe artifacts (which are served from Maven Central).
 */
module.exports = function withRestrictJitpack(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const mod = cfg.modResults;
    if (!mod || !mod.contents) return cfg;

    // Replace any jitpack repo block with a filtered one (supports with/without www)
    const jitpackBlockRegex = /maven\s*\{\s*url\s*['"]https?:\/\/(?:www\.)?jitpack\.io['"][^}]*\}/g;
    // Also handle shorthand: maven("https://jitpack.io") or maven('https://www.jitpack.io')
    const jitpackShorthandRegex = /maven\s*\(\s*['"]https?:\/\/(?:www\.)?jitpack\.io['"]\s*\)/g;

    const replacement = `maven {
        url 'https://www.jitpack.io'
        content {
          excludeGroup('com.stripe')
          excludeGroupByRegex("com\\\\.stripe(\\\\..*)?")
        }
      }`;

    const before = mod.contents;
    let after = before.replace(jitpackBlockRegex, replacement);
    after = after.replace(jitpackShorthandRegex, replacement);

    mod.contents = after;
    return cfg;
  });
};
