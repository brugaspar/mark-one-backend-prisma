"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require(".prisma/client");
const pg_1 = require("pg");
const disabled_helper_1 = require("../helpers/disabled.helper");
const logs_repository_1 = __importDefault(require("./logs.repository"));
const prisma = new client_1.PrismaClient();
const pgPool = new pg_1.Pool();
class PlansRepository {
    async store(plan, requestUserId) {
        const { disabledAt, lastDisabledBy, lastUpdatedBy, createdBy, logUserId } = (0, disabled_helper_1.getDisabledInfo)(plan.disabled, requestUserId);
        const { id } = await prisma.plans.create({
            data: {
                ...plan,
                createdBy,
                lastUpdatedBy,
                disabledAt,
                lastDisabledBy,
            },
            select: {
                id: true,
            },
        });
        await logs_repository_1.default.store("members_plans", {
            action: "insert",
            description: "Registro incluído por usuário",
            referenceId: id,
            userId: logUserId,
        });
        return id;
    }
    async findAll({ onlyEnabled = true, search = "" }) {
        //? Antigo SELECT, com case-sensitive e considerando acentos
        // const users = await prisma.users.findMany({
        //   where: {
        //     disabled: onlyEnabled ? false : undefined,
        //   },
        //   include: {
        //     disabledByUser: true,
        //   },
        // })
        const splittedSearch = search.split(" ");
        let searchText = "";
        splittedSearch.forEach((word, index) => {
            searchText += `
        (
          upper(unaccent(p.name)) like upper(unaccent('%${word}%'))
        )
      `;
            if (index !== splittedSearch.length - 1) {
                searchText += "and";
            }
        });
        let whereClause = `
      where
        ${onlyEnabled ? `p.disabled = false and` : ""}
        ${searchText}
    `;
        const pg = await pgPool.connect();
        const query = `
      select
        p.id,
        p.name,
        p.description,
        p.value,
        p.renew_value,
        p.gun_target_discount,
        p.course_discount,
        p.shooting_drills_per_year,
        p.gun_exemption,
        p.target_exemption,
        p.disabled,
        p.disabled_at,
        p.created_at,
        p.updated_at,
        p.last_disabled_by,
        p.last_updated_by,
        p.created_by,
        (select u2.name from users u2 where u2.id = p.last_disabled_by) disabled_by_user
      from
        members_plans p
      ${whereClause}
      order by
        p.created_at
    `;
        const plans = await pg.query(query);
        await pg.release();
        if (!plans) {
            return [];
        }
        const parsedUsersResult = plans.rows.map((plan) => {
            const disabledAt = plan.disabled_at ? new Date(plan.disabled_at).toISOString() : null;
            const createdAt = plan.created_at ? new Date(plan.created_at).toISOString() : null;
            const updatedAt = plan.updated_at ? new Date(plan.updated_at).toISOString() : null;
            return {
                id: plan.id,
                name: plan.name,
                description: plan.description,
                value: plan.value,
                renewValue: plan.renew_value,
                gunTargetDiscount: plan.gun_target_discount,
                courseDiscount: plan.course_discount,
                shootingDrillsPerYear: plan.shooting_drills_per_year,
                gunExemption: plan.gun_exemption,
                targetExemption: plan.target_exemption,
                disabled: plan.disabled,
                disabledAt,
                createdAt,
                updatedAt,
                lastDisabledBy: plan.last_disabled_by,
                lastUpdatedBy: plan.last_updated_by,
                createdBy: plan.created_by,
                disabledByUser: plan.disabled_by_user,
            };
        });
        return parsedUsersResult;
    }
    async findById(id) {
        const plan = await prisma.plans.findUnique({
            where: {
                id,
            },
        });
        return plan;
    }
    async update({ plan, requestUserId, planId }) {
        const { disabledAt, lastDisabledBy, lastUpdatedBy, logUserId } = (0, disabled_helper_1.getDisabledInfo)(plan.disabled, requestUserId);
        const { id } = await prisma.plans.update({
            data: {
                ...plan,
                disabledAt,
                lastDisabledBy,
                lastUpdatedBy,
            },
            where: {
                id: planId,
            },
            select: {
                id: true,
            },
        });
        await logs_repository_1.default.store("members_plans", {
            action: "update",
            description: "Registro atualizado por usuário",
            referenceId: id,
            userId: logUserId,
        });
        return id;
    }
}
exports.default = new PlansRepository();
