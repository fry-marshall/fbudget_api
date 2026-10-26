import { DataSource } from "typeorm";

/**
 * Empty every entity table in a single TRUNCATE, so new tables are cleaned without updating the tests
 */
export const resetDatabase = async (dataSource: DataSource): Promise<void> => {
    const tables = dataSource.entityMetadatas
        .filter((metadata) => metadata.tableType !== 'view')
        .map((metadata) => `"${metadata.tableName}"`)

    if (!tables.length) return

    await dataSource.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
}
