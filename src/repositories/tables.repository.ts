import { PrismaClient } from ".prisma/client"

const prisma = new PrismaClient()

class TablesRepository {
  async findByName(name: string) {
    const id = await prisma.tables.findUnique({
      where: {
        name,
      },
      select: {
        id: true,
      },
    })

    return id
  }
}

export default new TablesRepository()
