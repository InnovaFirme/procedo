# Procedo

A type-safe, fluent TypeScript container for executing procedures and handlers with middleware support and cancellation tokens.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with generic type inference
- 🔄 **Fluent API**: Chain calls with `.register().middleware().using(factory)`
- 🔌 **Global Config**: Set global middleware and default factory directly on the container
- ⚡ **Proxy Pattern**: Access procedures as properties: `app.procedureName()`
- 🎭 **Immutable Containers**: Each registration returns a new typed container
- ⛔ **Cancellation Tokens**: Built-in support for operation cancellation
- 🐫 **CamelCase Converter**: Access snake_case procedures with camelCase via `jscriptify()`
- 🗃️ **Database Agnostic**: Works with any database or handler implementation

## Installation

Install directly from GitHub:

```bash
npm install gaspect/procedo
# or
pnpm add gaspect/procedo
# or
yarn add gaspect/procedo
```

Or using the full URL:

```bash
npm install https://github.com/gaspect/procedo
```

**Note:** When installing from GitHub, the package will compile automatically thanks to the `prepare` script. This may take a few seconds the first time.

## TypeScript Support

TypeScript types are included automatically with the package. You don't need to install `@types/procedo` separately.

**Recommended `tsconfig.json` configuration:**

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## Quick Start

This example uses PostgreSQL, but Procedo works with any handler implementation:

```typescript
import { container, api } from 'procedo';

// Example with a custom handler
const customHandler = (name: string) => async (input: any) => {
  // Your custom logic here
  console.log(`Executing ${name} with`, input);
  return { success: true };
};

// Create a type-safe container
const app = api(container())
  .using(customHandler)
  .register('my_procedure');

// Call as a method
const result = await app.my_procedure({ userId: 123 });
```

### Example with PostgreSQL

```typescript
import { Pool } from 'pg';
import { container, api, postgres } from 'procedo';

// Create a PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'mydb',
  password: 'password',
  port: 5432,
});

// Define your types
type Migration = {
  description: string;
  type: string;
  script: string;
};

// Create a container with type-safe procedure registration
// PostgreSQL procedures use snake_case naming convention
const app = api(container())
  .using(postgres(pool))
  .register<undefined, Migration[]>('get_migrations');

// Call procedures as methods
const migrations = await app.get_migrations();
console.log(migrations[0]?.description);
```

### Working with Different Naming Conventions

Use `jscriptify()` to access procedures with camelCase syntax, regardless of how they're registered:

```typescript
import { jscriptify } from 'procedo';

// Works with snake_case procedures (common in databases)
const app = api(container())
  .register('get_migration_history')  // snake_case
  .as<void, Migration[]>()
  .using(someHandler);

// Access with camelCase
const jsApi = jscriptify(app);
const history = await jsApi.getMigrationHistory();

// Also works if procedures are registered in camelCase
const app2 = api(container())
  .register('getUserProfile')  // camelCase
  .as<number, Profile>()
  .using(someHandler);

const jsApi2 = jscriptify(app2);
const profile = await jsApi2.getUserProfile(123);  // Works!
```

## Core Concepts

### Container

The container is an immutable registry of procedures. Each registration returns a new container with updated type information.

```typescript
import { container } from 'procedo';

const c = container();
```

### API Adapter

The `api()` adapter wraps a container and provides a fluent interface for registration and property-based access via JavaScript Proxy.

```typescript
import { api, container } from 'procedo';

const app = api(container())
  .using(someHandler)
  .register<InputType, OutputType>('myProcedure');

// Call as a method
const result = await app.myProcedure(input);
```

### Global Configuration

You can set a default factory or global middleware that applies to all subsequent registrations:

```typescript
const app = api(container())
  .using(defaultHandler)
  .middleware(globalLogger)
  .register('proc1') // uses defaultHandler + globalLogger
  .register('proc2') // uses defaultHandler + globalLogger
  .using(specialHandler)
  .register('proc3'); // uses specialHandler + globalLogger
```

## API Reference

### `container<T>()`

Creates a new immutable container instance.

**Returns:** `ContainerInstance<T>`

**Methods:**
- `register(name: string)` - Returns a builder to configure the procedure
- `execute(name: string, input?: any)` - Executes a registered procedure
- `as<I, O>()` - Re-types the last registered procedure

### `api<T>(source: ContainerLike<T>)`

Wraps a container with a Proxy to enable property-based access and provides global configuration methods.

**Methods:**
- `.using(factory)` - Sets the default handler factory
- `.middleware(mw)` - Adds a global middleware layer
- `.register(name)` - Starts registration of a new procedure

**Example:**
```typescript
const app = api(container())
  .using(someHandler)
  .middleware(logger)
  .register<void, User[]>('get_users');

const users = await app.get_users();
```

### `jscriptify<T>(container: TypedContainer<T>)`

Converts a container to allow accessing procedures with camelCase property names. Works intelligently with both snake_case and camelCase procedure names.

**Features:**
- Automatically tries snake_case first (common in databases), then camelCase
- Full TypeScript support with type-level conversion
- Preserves input/output types
- Maintains autocomplete and type safety
- Works regardless of how procedures are registered

**How it works:**
When you call `jsApi.getUserOrders()`, it will:
1. First try to execute `get_user_orders` (snake_case conversion)
2. If that fails, try `getUserOrders` (original camelCase)
3. This means it works whether procedures are registered as `get_user_orders` or `getUserOrders`

**Example with snake_case procedures:**
```typescript
const app = api(container())
  .register('get_user_orders')  // snake_case (common in databases)
  .as<number, Order[]>()
  .using(someHandler);

const jsApi = jscriptify(app);

// Access with camelCase - converts to 'get_user_orders' automatically
const orders = await jsApi.getUserOrders(userId);
```

**Example with camelCase procedures:**
```typescript
const app = api(container())
  .register('getUserOrders')  // camelCase
  .as<number, Order[]>()
  .using(someHandler);

const jsApi = jscriptify(app);

// Works the same way
const orders = await jsApi.getUserOrders(userId);
```

**Type Conversion Examples:**
- `list_migration_history` → `listMigrationHistory`
- `get_user_data` → `getUserData`
- `create_new_order` → `createNewOrder`

### Handler Factories

A handler factory is a function that creates handlers for procedures:

```typescript
type HandlerFactory = (name: string) => Handler;
type Handler = (input: any, token: CancellationToken) => Promise<any>;
```

#### `postgres(pool: Pool)`

Example handler factory for PostgreSQL procedures.

**Features:**
- Automatically detects functions vs procedures
- Handles stored procedures with cursors
- Supports transactions for cursor-based procedures

**Example:**
```typescript
import { Pool } from 'pg';
import { postgres } from 'procedo';

const pool = new Pool({...});

const app = api(container())
  .register('get_users')
  .as<void, User[]>()
  .using(postgres(pool));
```

## Middleware

Middleware allows you to intercept and modify procedure execution. You can apply middleware per-procedure or globally. Middleware chains are built by calling `.middleware()` multiple times — each call wraps the previous layer, and TypeScript **automatically infers** the `next` parameter type at every position.

### Per-Procedure Middleware

Use `.middleware()` to apply middleware to a specific procedure:

```typescript
const loggingMiddleware: Middleware = async (input, next, token) => {
  console.log('Before:', input);
  const result = await next(input);
  console.log('After:', result);
  return result;
};

const app = api(container())
  .register('create_user')
  .as<UserInput, User>()
  .middleware(loggingMiddleware)  // Apply to this procedure only
  .using(someHandler);
```

### Global Middleware

Use `.middleware()` on the `api()` instance to apply middleware to all procedures registered afterwards:

```typescript
const app = api(container())
  .middleware(loggingMiddleware)
  .using(someHandler)
  .register<UserInput, User>('create_user')
  .register<UserUpdate, User>('update_user');

// loggingMiddleware is applied to both procedures
```

#### Chaining Multiple Global Middlewares

Chain `.middleware()` calls to add multiple global layers:

```typescript
const app = api(container())
  .middleware(loggingMiddleware)
  .middleware(timingMiddleware)
  .middleware(authMiddleware)
  .using(someHandler)
  .register<UserInput, User>('create_user');

// Execution order: loggingMiddleware → timingMiddleware → authMiddleware → handler
```

### Combining Middleware

Combine global and per-procedure middleware:

```typescript
// Global logging + timing for all procedures
const app = api(container())
  .middleware(loggingMiddleware)
  .middleware(timingMiddleware)
  .using(someHandler)
  .register<UserInput, User>('create_user')
  .middleware(validationMiddleware); // Add validation to this one only

// Execution order: loggingMiddleware → timingMiddleware → validationMiddleware → handler
```

### Chained `.middleware()` — Automatic `next` Inference

Chain multiple `.middleware()` calls to build a multi-layer middleware pipeline. Register them **innermost first** (closest to handler), then outward (closest to caller). TypeScript infers the `next` type at every position — you only annotate `input`.

```typescript
const app = api(container())
  .register('complexAuth')
  .as<number, string>()  // Handler: number → string
  // Layer 3 (innermost): next = handler → (number) => Promise<string>
  .middleware(async (input: number, next, _) => {
    const raw = await next(input);  // raw: string ✓
    return raw.toUpperCase();
  })
  // Layer 2: next = L3 → (number) => Promise<string>
  .middleware(async (input: { id: number; verified: boolean }, next, _) => {
    if (!input.verified) throw new Error('Not verified');
    const data = await next(input.id);  // data: string ✓
    return `[${data}]`;
  })
  // Layer 1 (outermost): next = L2 → ({ id, verified }) => Promise<string>
  .middleware(async (input: { token: string; userId: string }, next, _) => {
    if (input.token !== 'secret') throw new Error('Unauthorized');
    const result = await next({ id: Number.parseInt(input.userId), verified: true });
    return `AUTHENTICATED: ${result}`;  // result: string ✓
  })
  .using(handler);

await app.complexAuth({ token: 'secret', userId: '99' });
// Execution flow (onion pattern):
// 1. Layer 1: Authenticates → passes { id: 99, verified: true }
// 2. Layer 2: Authorizes → passes 99
// 3. Layer 3: Transforms → passes 99
// 4. Handler: Returns "user_99"
// 5. Layer 3: Returns "USER_99"
// 6. Layer 2: Returns "[USER_99]"
// 7. Layer 1: Returns "AUTHENTICATED: [USER_99]"
```

**Why innermost first?** TypeScript processes types left-to-right. The first `.middleware()` call has its `next` anchored to the handler types from `.as<I, O>()`. Each subsequent call knows the previous middleware's types, so `next` is always fully resolved — no manual typing needed.

### Pre-Typed Middleware Variables

You can also declare middleware with explicit `Middleware<I, O, NextI, NextO>` types and chain them:

```typescript
// Layer 2 (INNER - closer to handler)
const validationLayer: Middleware<
  { id: number },   // I: receives from outer
  string,            // O: returns to outer
  number,            // NextI: passes to handler
  { name: string }   // NextO: receives from handler
> = async (input, next, _) => {
  const user = await next(input.id);
  return `${user.name}`;
};

// Layer 1 (OUTER - defines external API)
const authLayer: Middleware<
  { userId: string; token: string },  // I: external input
  string,                              // O: external output
  { id: number },                      // NextI: passes to inner
  string                               // NextO: receives from inner
> = async (input, next, _) => {
  if (input.token !== 'valid') throw new Error('Unauthorized');
  return (await next({ id: Number.parseInt(input.userId) })).toUpperCase();
};

const app = api(container())
  .register('process_user')
  .as<number, { name: string }>()  // Handler types
  .middleware(validationLayer)       // inner first
  .middleware(authLayer)             // outer wraps it
  .using(userHandler);

// External API: { userId: string; token: string } → string
await app.process_user({ userId: '123', token: 'valid' });
```

TypeScript ensures at compile time:
- `authLayer.NextI` matches `validationLayer.I` ✓
- `authLayer.NextO` matches `validationLayer.O` ✓
- `validationLayer.NextI` matches handler input from `.as<>()` ✓
- `validationLayer.NextO` matches handler output from `.as<>()` ✓

### Custom Middleware

Create your own middleware:

```typescript
import type { Middleware } from 'procedo';

const timingMiddleware: Middleware = async (input, next, token) => {
  const start = Date.now();
  try {
    const result = await next(input);
    console.log(`Executed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`Failed after ${Date.now() - start}ms`);
    throw error;
  }
};
```

### Type Transformations with Middleware

Middleware can transform both input and output types. This allows you to adapt the external API of your procedures while keeping the handler implementation separate.

#### Type Signature

```typescript
type Middleware<I = any, O = any, NextI = I, NextO = O> = (
  input: I,                           // Type received by middleware
  next: (input: NextI) => Promise<NextO>,  // Type passed to next handler
  token: CancellationToken
) => Promise<O>;                      // Type returned by middleware
```

Where:
- `I`: Input type that the middleware **receives** from the caller
- `O`: Output type that the middleware **returns** to the caller
- `NextI`: Input type that the middleware **passes** to the next handler (defaults to `I`)
- `NextO`: Output type that the next handler **returns** (defaults to `O`)

#### Input Transformation

Transform the input before it reaches the handler:

```typescript
// Handler expects a number
const app = api(container())
  .register('getUserData')
  .as<number, UserData>()
  .middleware<{ userId: number; metadata: string }>(
    async (input, next, token) => {
      // Receive { userId, metadata }, pass only userId to handler
      return await next(input.userId);
    }
  )
  .using(userHandler);

// Caller passes an object
await app.getUserData({ userId: 123, metadata: 'extra info' });
```

#### Output Transformation

Transform the output from the handler:

```typescript
// Handler returns raw data
const app = api(container())
  .register('fetchData')
  .as<number, RawData>()
  .middleware<number, FormattedResponse>(
    async (input, next, token) => {
      const rawData = await next(input);
      // Transform output
      return {
        success: true,
        data: rawData,
        timestamp: new Date()
      };
    }
  )
  .using(dataHandler);

// Caller receives FormattedResponse
const response = await app.fetchData(123);
// response: { success: true, data: RawData, timestamp: Date }
```

#### Input AND Output Transformation

Combine both transformations:

```typescript
type RequestPayload = { userId: number; options: Options };
type ResponseEnvelope = { success: boolean; data: UserData };

const app = api(container())
  .register('getUser')
  .as<number, UserData>()  // Handler types
  .middleware<RequestPayload, ResponseEnvelope>(
    async (input, next, token) => {
      // Transform input: extract userId
      const userData = await next(input.userId);
      // Transform output: wrap in envelope
      return {
        success: true,
        data: userData
      };
    }
  )
  .using(userHandler);

// API signature is RequestPayload → ResponseEnvelope
const response = await app.getUser({ 
  userId: 123, 
  options: { includeProfile: true } 
});
// response: { success: true, data: UserData }
```

#### Real-World Example: API Validation & Formatting

```typescript
import type { Middleware } from 'procedo';

// Middleware that validates input and formats output
const apiMiddleware: Middleware<
  { id: number; token: string },  // API expects this
  { status: 'ok' | 'error'; result: any },  // API returns this
  number,  // Handler receives this
  any      // Handler returns this
> = async (input, next, token) => {
  // Input validation
  if (!input.token || input.token !== 'valid-token') {
    return { status: 'error', result: 'Invalid token' };
  }
  
  try {
    // Pass validated ID to handler
    const result = await next(input.id);
    // Format success response
    return { status: 'ok', result };
  } catch (error) {
    // Format error response
    return { status: 'error', result: error.message };
  }
};

const app = api(container())
  .register('get_user_data')
  .as<number, UserData>()
  .middleware(apiMiddleware)
  .using(postgres(pool));

// Usage matches the middleware's outer types
const response = await app.get_user_data({ 
  id: 123, 
  token: 'valid-token' 
});
// response: { status: 'ok', result: UserData }
```

## Handler Implementations

Procedo is database-agnostic. You provide a handler factory that knows how to execute procedures. Here are some examples:

### Custom Handler

```typescript
import type { HandlerFactory } from 'procedo';

const customHandler: HandlerFactory = (name: string) => {
  return async (input: any, token) => {
    // Your custom logic - could be REST API, RPC, etc.
    token.check(); // Check for cancellation
    console.log(`Executing ${name}`);
    return someAsyncOperation(name, input);
  };
};

const app = api(container())
  .register('my_operation')
  .as<Input, Output>()
  .using(customHandler);
```

### PostgreSQL Example

The `postgres()` handler is an example implementation for PostgreSQL:

```typescript
import { Pool } from 'pg';
import { postgres } from 'procedo';

const pool = new Pool({ /* config */ });

const app = api(container())
  .register('get_users')
  .as<void, User[]>()
  .using(postgres(pool));
```

**PostgreSQL Stored Procedures:**

Function (Recommended):
```sql
CREATE OR REPLACE FUNCTION get_users()
RETURNS TABLE(id INT, name TEXT, email TEXT) AS $$
BEGIN
    RETURN QUERY SELECT u.id, u.name, u.email FROM users u;
END;
$$ LANGUAGE plpgsql;
```

Procedure with Cursor:
```sql
CREATE OR REPLACE PROCEDURE get_migrations() AS $$
DECLARE
    get_migrations_cursor REFCURSOR := 'get_migrations_cursor';
BEGIN
    OPEN get_migrations_cursor FOR
        SELECT description, type, script FROM flyway_schema_history;
END;
$$ LANGUAGE plpgsql;
```

**Note:** The `postgres()` handler automatically detects cursors following the `{procedureName}_cursor` pattern.

## Advanced Examples

### Multiple Procedures

```typescript
const app = api(container())
  .register('get_users')
  .as<void, User[]>()
  .using(someHandler)
  .register('get_user')
  .as<number, User>()
  .using(someHandler)
  .register('create_user')
  .as<UserInput, User>()
  .using(someHandler);

const allUsers = await app.get_users();
const user = await app.get_user(1);
const newUser = await app.create_user({ name: 'John', email: 'john@example.com' });

// Or use jscriptify for camelCase access (if procedures use snake_case)
const jsApi = jscriptify(app);
const allUsers2 = await jsApi.getUsers();
const user2 = await jsApi.getUser(1);
```

### Using with Default Factory

```typescript
const db = using(api(container()), someHandler);

const app = db
  .register('get_users').as<void, User[]>()
  .register('get_orders').as<number, Order[]>()
  .register('get_products').as<void, Product[]>();

const users = await app.get_users();
const orders = await app.get_orders(userId);
const products = await app.get_products();
```

### Type Inference

```typescript
// TypeScript infers the return type automatically
const app = api(container())
  .register('get_user')
  .as<number, { id: number; name: string }>()
  .using(someHandler);

// result is typed as { id: number; name: string }
const result = await app.get_user(1);
console.log(result.name); // ✅ Type-safe
```

### CamelCase Conversion with jscriptify

```typescript
// Your procedures use snake_case (common in databases)
const app = api(container())
  .register('get_user_profile')
  .as<number, UserProfile>()
  .using(someHandler)
  .register('list_active_orders')
  .as<void, Order[]>()
  .using(someHandler)
  .register('update_user_settings')
  .as<SettingsInput, Settings>()
  .using(someHandler);

// Convert to JavaScript/TypeScript naming convention
const jsApi = jscriptify(app);

// Now use camelCase - fully type-safe!
const profile = await jsApi.getUserProfile(123);
const orders = await jsApi.listActiveOrders();
const settings = await jsApi.updateUserSettings({ theme: 'dark' });

// ✅ TypeScript autocomplete works
// ✅ Input/output types are preserved
// ✅ Compile-time errors for typos
console.log(profile.name); // ✅ Type-safe
```

## TypeScript Support

Procedo is written in TypeScript and provides full type safety:

```typescript
type Input = { userId: number; year: number };
type Output = { total: number; currency: string };

const app = api(container())
  .register('get_order_total')
  .as<Input, Output>()
  .using(someHandler);

// ✅ Type-safe input
const result = await app.get_order_total({ userId: 1, year: 2024 });

// ✅ Type-safe output
console.log(result.total.toFixed(2));

// ❌ TypeScript error
// console.log(result.invalid);
```

## Error Handling

Use middleware for error handling and compensation logic:

```typescript
const errorHandlingMiddleware: Middleware = async (input, next, token) => {
  try {
    return await next(input);
  } catch (error) {
    console.error('Operation failed:', error);
    // Perform compensation/rollback here
    throw error;
  }
};

const app = api(container())
  .register('create_user')
  .as<UserInput, User>()
  .middleware(errorHandlingMiddleware)
  .using(someHandler);

try {
  const user = await app.create_user(userData);
  console.log('User created:', user);
} catch (error) {
  console.error('Failed to create user:', error);
}
```

## Cancellation

All handlers receive a cancellation token:

```typescript
import type { Handler } from 'procedo';

const customHandler: Handler = async (input, token) => {
  token.check(); // Throws if cancelled
  
  // Your logic here
  const result = await someAsyncOperation();
  
  token.check(); // Check again
  
  return result;
};
```

## Building

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Watch mode for development
pnpm dev

# Clean build artifacts
pnpm clean
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC


---

**Keywords:** typescript, handler-factory, procedure-container, database-agnostic, dependency-injection, middleware, type-safe, fluent-api, snake-case, camelcase, naming-convention, proxy-pattern, immutable, cancellation-token
