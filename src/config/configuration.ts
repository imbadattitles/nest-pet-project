export default () => ({
    port: parseInt(process.env.PORT as string, 10) || 5000,
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/nest-blog',
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key',
      expiresIn: process.env.JWT_EXPIRE || '7d',
    },
    bcrypt: {
      saltRounds: 10,
    },
  });