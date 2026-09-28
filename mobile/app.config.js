const fs = require('fs');
const path = require('path');

/**
 * app.json is the universal app. An institute's own build (an EAS profile
 * made by scripts/institute-app.mjs) sets EXPO_PUBLIC_INSTITUTE, and gets its
 * own name, package ID and, when assets/institutes/<code>/icon.png exists,
 * its own icon, so it installs beside the universal app and any other
 * institute's.
 */
module.exports = ({ config }) => {
  const code = process.env.EXPO_PUBLIC_INSTITUTE?.trim().toLowerCase();
  if (!code) return config;

  // A package segment is letters and digits and cannot start with a digit.
  const id = code.replace(/[^a-z0-9]/g, '').replace(/^(\d)/, 'i$1');
  const appId = `in.ac.campusos.${id}`;
  const icon = path.join('assets', 'institutes', code, 'icon.png');
  const hasIcon = fs.existsSync(path.join(__dirname, icon));

  return {
    ...config,
    name: process.env.EXPO_PUBLIC_INSTITUTE_NAME?.trim() || config.name,
    scheme: `campusos-${id}`,
    ...(hasIcon ? { icon: `./${icon.replace(/\\/g, '/')}` } : {}),
    ios: { ...config.ios, bundleIdentifier: appId },
    android: {
      ...config.android,
      package: appId,
      ...(hasIcon
        ? { adaptiveIcon: { ...config.android?.adaptiveIcon, foregroundImage: `./${icon.replace(/\\/g, '/')}` } }
        : {}),
    },
  };
};
