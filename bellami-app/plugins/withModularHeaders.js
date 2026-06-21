const { withPodfile } = require('@expo/config-plugins');

module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;
    
    // Add use_modular_headers! after the platform line
    const platformLine = /platform :ios, podfile_properties\['ios\.deploymentTarget'\] \|\| '15\.1'/;
    const match = podfile.match(platformLine);
    
    if (match && !podfile.includes('use_modular_headers!')) {
      config.modResults.contents = podfile.replace(
        platformLine,
        `${match[0]}\n\nuse_modular_headers!`
      );
    }
    
    return config;
  });
};
