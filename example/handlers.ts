import { CancellationToken } from '../src/cancellation';
import type { HandlerFactory } from '../src/types';

export function postgres(
    pool: any
): HandlerFactory {

    return (procedureName: string) => {

        return async (input: any, token: CancellationToken) => {
            token.check();

            const hasInput = input !== undefined && input !== null;
            const client = await pool.connect();

            try {
                const query = hasInput
                    ? `SELECT * FROM ${procedureName}($1)`
                    : `SELECT * FROM ${procedureName}()`;
                const params = hasInput ? [input] : [];

                const result = await client.query(query, params);
                return result.rows ?? [];
            } catch (error) {
                try {
                    await client.query('BEGIN');
                    const cursorName = `${procedureName}_cursor`;

                    if (hasInput) {
                        await client.query(`CALL ${procedureName}($1)`, [input]);
                    } else {
                        await client.query(`CALL ${procedureName}()`);
                    }

                    const result = await client.query(`FETCH ALL FROM "${cursorName}"`);
                    await client.query('COMMIT');
                    return result.rows ?? [];
                } catch (procError) {
                    await client.query('ROLLBACK');
                    throw procError;
                }
            } finally {
                client.release();
            }
        };
    };
}