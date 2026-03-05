module.exports = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon'
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'pinglet',
        setupIcon: 'assets/icon.ico'
      }
    }
  ]
};
