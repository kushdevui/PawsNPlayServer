import type { RequestHandler } from 'express';
import { authUser } from '../../middleware/auth.js';
import { created, ok } from '../../utils/respond.js';
import type { LoginBody, LogoutBody, RefreshBody, RegisterBody, UpdateMeBody } from './auth.schema.js';
import * as authService from './auth.service.js';

export const login: RequestHandler = async (req, res) => {
  ok(res, await authService.login(req.body as LoginBody));
};

export const register: RequestHandler = async (req, res) => {
  created(res, await authService.register(req.body as RegisterBody));
};

export const refresh: RequestHandler = async (req, res) => {
  ok(res, await authService.refresh((req.body as RefreshBody).refreshToken));
};

export const logout: RequestHandler = async (req, res) => {
  ok(res, await authService.logout(authUser(req).id, (req.body as LogoutBody).refreshToken));
};

export const getMe: RequestHandler = async (req, res) => {
  ok(res, await authService.getMe(authUser(req).id));
};

export const updateMe: RequestHandler = async (req, res) => {
  ok(res, await authService.updateMe(authUser(req).id, req.body as UpdateMeBody));
};
