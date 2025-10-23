const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * SIMPLIFIED VERSION: Only uses excludeGroup (no regex) to avoid Groovy escaping issues.
 * This is sufficient for com.stripe since it's the exact group ID.
 */
module.exports = function withRestrictJitpack(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const mod = cfg.modResults;
    if (!mod || !mod.contents) return cfg;

    // Replace any jitpack repo block with a filtered one
    const jitpackBlockRegex = /maven\s*\{\s*url\s*['"]https?:\/\/(?:www\.)?jitpack\.io['"][^}]*\}/g;
    const jitpackShorthandRegex = /maven\s*\(\s*['"]https?:\/\/(?:www\.)?jitpack\.io['"]\s*\)/g;

    const replacement = `maven {
        url 'https://www.jitpack.io'
        content {
          excludeGroup('com.stripe')
        }
      }`;

    let after = mod.contents;
    after = after.replace(jitpackBlockRegex, replacement);
    after = after.replace(jitpackShorthandRegex, replacement);

    mod.contents = after;
    return cfg;
  });
};
