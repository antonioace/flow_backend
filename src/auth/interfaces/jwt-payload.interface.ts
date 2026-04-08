export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  profile?: string;
  name?: string;
}
