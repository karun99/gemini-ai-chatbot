/** @type {import('next').NextConfig} */
module.exports = {
  // Produce a self-contained server bundle so the Docker runtime image does not
  // need the full node_modules tree.
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**'
      }
    ]
  }
}
