import { Controller, Get, HttpCode, Request, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { IOidcPassportUser } from '../common/auth/interfaces/oidc-passport-user';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@Controller('users')
@ApiTags('Users')
export class UserController {
  @Get('/me')
  @UseGuards(AuthenticatedGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Get current user information' })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User not authenticated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have required authorizations',
  })
  @ApiBearerAuth()
  user(
    @Request() req: { user?: IOidcPassportUser },
  ): IOidcPassportUser | undefined {
    return req.user;
  }
}