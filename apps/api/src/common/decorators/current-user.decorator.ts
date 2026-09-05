import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string;
  email: string;
  username: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtUser | undefined;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
