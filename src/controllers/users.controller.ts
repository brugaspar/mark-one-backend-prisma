import { Request, Response } from "express"
import * as yup from "yup"

import { AppError } from "../handlers/errors.handler"
import { checkBodySchema } from "../handlers/schema.handler"

import { verifyExistingPermissions } from "../helpers/permissions.helper"
import { comparePassword, hashPassword } from "../helpers/hash.helper"
import { checkRequestUser } from "../helpers/request.helper"

import usersRepository from "../repositories/users.repository"

type RequestUser = {
  name: string
  email: string
  password: string
  username: string
  permissions: string[]
  disabled: boolean
}

type RequestUpdateUser = RequestUser & {
  newPassword?: string
}

class UserController {
  async store(request: Request, response: Response) {
    const user: RequestUser = request.body

    const schema = {
      name: yup.string().required("Nome é obrigatório"),
      email: yup.string().email().required("E-mail é obrigatório"),
      password: yup.string().required("Senha é obrigatória"),
      username: yup.string().required("Nome de usuário é obrigatório"),
      permissions: yup.array(),
      disabled: yup.boolean(),
    }

    await checkBodySchema(schema, request.body)

    await checkRequestUser(request.userId)

    const usernameExists = await usersRepository.findByUsername(user.username)

    if (usernameExists) {
      throw new AppError("Nome de usuário já está em uso")
    }

    const emailExists = await usersRepository.findByEmail(user.email)

    if (emailExists) {
      throw new AppError("E-mail já está em uso")
    }

    if (user.permissions) {
      const nonexistentPermissions = await verifyExistingPermissions(user.permissions)

      if (nonexistentPermissions.length) {
        return response.status(400).json({
          message: "Uma ou mais permissões não existem",
          nonexistentPermissions,
        })
      }

      user.permissions = user.permissions.filter((permission, index) => user.permissions.indexOf(permission) === index)
    }

    const hashedPassword = await hashPassword(user.password)

    user.password = hashedPassword

    const storedUser = await usersRepository.store(user, request.userId)

    return response.status(201).json({ id: storedUser })
  }

  async index(request: Request, response: Response) {
    const { onlyEnabled = true, search = "", sort = { name: "", sort: "asc" } } = request.query as any

    const parsedOnlyEnabled = onlyEnabled ? JSON.parse(onlyEnabled) : true

    let parsedSort = { name: "", sort: "asc" }

    try {
      parsedSort = JSON.parse(sort)
    } catch (error) {
      // ignore
    }

    await checkRequestUser(request.userId)

    const users = await usersRepository.findAll({
      onlyEnabled: parsedOnlyEnabled,
      search,
      sort: parsedSort,
    })

    const parsedUsers = users.map((user) => {
      return {
        ...user,
        password: undefined,
      }
    })

    return response.status(200).json(parsedUsers)
  }

  async show(request: Request, response: Response) {
    const id = request.params.id

    await checkRequestUser(request.userId)

    const user = await usersRepository.findById(!id ? request.userId : id)

    if (!user) {
      throw new AppError("Usuário não encontrado")
    }

    const parsedUser = {
      ...user,
      password: undefined,
    }

    return response.status(200).json(parsedUser)
  }

  async findPermissions(request: Request, response: Response) {
    const user = await usersRepository.findById(request.userId)

    if (!user) {
      throw new AppError("Usuário não encontrado")
    }

    return response.status(200).json({ permissions: user.permissions })
  }

  async update(request: Request, response: Response) {
    const user: RequestUpdateUser = request.body

    const id = request.params.id

    const schema = {
      name: yup.string(),
      email: yup.string().email(),
      password: yup.string(),
      username: yup.string(),
      permissions: yup.array(),
      disabled: yup.boolean(),
    }

    await checkBodySchema(schema, request.body)

    await checkRequestUser(request.userId)

    const usersExists = await usersRepository.findById(id)

    if (!usersExists) {
      throw new AppError("Usuário não encontrado")
    }

    if (user.username && user.username !== usersExists.username) {
      const usernameExists = await usersRepository.findByUsername(user.username)

      if (usernameExists) {
        throw new AppError("Nome de usuário já está em uso")
      }
    }

    if (user.email && user.email !== usersExists.email) {
      const emailExists = await usersRepository.findByEmail(user.email)

      if (emailExists) {
        throw new AppError("E-mail já está em uso")
      }
    }

    if (user.newPassword) {
      const matchPasswords = await comparePassword(user.password, usersExists.password)

      if (!matchPasswords) {
        throw new AppError("Senha atual não confere")
      }

      user.password = user.newPassword
    }

    if (user.permissions) {
      const nonexistentPermissions = await verifyExistingPermissions(user.permissions)

      if (nonexistentPermissions.length) {
        return response.status(400).json({
          message: "Uma ou mais permissões não existem",
          nonexistentPermissions,
        })
      }

      user.permissions = user.permissions.filter((permission, index) => user.permissions.indexOf(permission) === index)
    }

    if (user.password) {
      const hashedPassword = await hashPassword(user.password)

      user.password = hashedPassword
    }

    delete user.newPassword

    const updatedUser = await usersRepository.update({
      user,
      requestUserId: request.userId,
      userId: id,
    })

    return response.status(200).json({ id: updatedUser })
  }
}

export default new UserController()
