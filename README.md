# Procedo

A type-safe, fluent TypeScript container for executing procedures and handlers with middleware support and cancellation tokens.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with generic type inference
- 🎯 **Fluent API**: Chain calls with `.register().as<I, O>().using(factory)`
- 🔌 **Middleware Support**: Compose error handling, logging, and custom behaviors
- ⚡ **Proxy Pattern**: Access procedures as properties: `app.procedureName()`
- 🎭 **Immutable Containers**: Each registration returns a new typed container
- ⛔ **Cancellation Tokens**: Built-in support for operation cancellation
- 🔄 **Adapter Pattern**: Multiple adapters for different use cases (`api`, `using`, `middleware`, `jscriptify`)
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
  .register('my_procedure')
  .as<{ userId: number }, { success: boolean }>()
  .using(customHandler);

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
  .register('get_migrations')  // snake_case for PostgreSQL
  .as<undefined, Migration[]>()
  .using(postgres(pool));

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

The `api()` adapter wraps a container and provides property-based access to procedures via JavaScript Proxy.

```typescript
import { api, container } from 'procedo';

const app = api(container())
  .register('myProcedure')
  .as<InputType, OutputType>()
  .using(someHandler);

// Call as a method
const result = await app.myProcedure(input);
```

### Using Adapter

The `using()` adapter provides a default factory so you don't need to pass it on every registration.

```typescript
import { using, api, container } from 'procedo';

const app = using(api(container()), someHandler)
  .register('procedure_one')
  .as<void, string[]>()
  .register('procedure_two')
  .as<number, boolean>();

// Factory is applied automatically
const result1 = await app.procedure_one();
const result2 = await app.procedure_two(42);
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

Wraps a container with a Proxy to enable property-based access.

**Example:**
```typescript
const app = api(container())
  .register('get_users')
  .as<void, User[]>()
  .using(someHandler);

const users = await app.get_users();
```

### `using<T>(source: ContainerLike<T>, factory: HandlerFactory)`

Wraps a container with a default handler factory, so you don't need to pass it on every `.using()`.

**Example:**
```typescript
const app = using(api(container()), someHandler)
  .register('get_orders')
  .as<string, Order[]>();

const orders = await app.get_orders('2024-01');
```

### `middleware<T>(source: ContainerLike<T>, mw: Middleware)`

Wraps a container with a default middleware that applies to all procedures.

**Example:**
```typescript
const loggingMw: Middleware = async (input, next, token) => {
  console.log('Before:', input);
  const result = await next(input);
  console.log('After:', result);
  return result;
};

const app = middleware(api(container()), loggingMw)
  .register('get_users')
  .as<void, User[]>()
  .using(someHandler);

// loggingMw is applied automatically
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

Middleware allows you to intercept and modify procedure execution. You can apply middleware per-procedure or globally.

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

Use the `middleware()` adapter to apply middleware to all procedures:

```typescript
import { middleware } from 'procedo';

const app = middleware(api(container()), loggingMiddleware)
  .register('create_user')
  .as<UserInput, User>()
  .using(someHandler)
  .register('update_user')
  .as<UserUpdate, User>()
  .using(someHandler);

// loggingMiddleware is applied to both procedures
```

### Combining Middleware

Combine global and per-procedure middleware:

```typescript
const timingMiddleware: Middleware = async (input, next, token) => {
  const start = Date.now();
  const result = await next(input);
  console.log(`Executed in ${Date.now() - start}ms`);
  return result;
};

// Global logging for all procedures
const app = middleware(api(container()), loggingMiddleware)
  .register('create_user')
  .as<UserInput, User>()
  .middleware(timingMiddleware)  // Add timing to this one
  .using(someHandler);

// Execution order: loggingMiddleware → timingMiddleware → handler
```

### `compound(...middlewares: Middleware[])`

Composes multiple middleware functions into a single middleware. Middlewares execute in an **onion pattern** (also known as the Russian doll model):

```typescript
import { compound } from 'procedo';

// Execution flow: outer → middle → inner → handler → inner → middle → outer
const combinedMw = compound(outerMiddleware, middleMiddleware, innerMiddleware);

const app = api(container())
  .register('my_procedure')
  .as<Input, Output>()
  .middleware(combinedMw)
  .using(someHandler);
```

#### Onion Pattern Execution

The **first** middleware in the list is the **outermost layer** (closest to the caller), and the **last** is the **innermost layer** (closest to the handler):

```typescript
const loggingMiddleware: Middleware = async (input, next, token) => {
  console.log('Outer: before');
  const result = await next(input);
  console.log('Outer: after');
  return result;
};

const timingMiddleware: Middleware = async (input, next, token) => {
  console.log('Inner: before');
  const start = Date.now();
  const result = await next(input);
  console.log(`Inner: after (${Date.now() - start}ms)`);
  return result;
};

compound(loggingMiddleware, timingMiddleware);

// Output when called:
// Outer: before
// Inner: before
// [handler executes]
// Inner: after (5ms)
// Outer: after
```

#### Type Transformation with Compound

When composing middlewares with different input/output types, the **first middleware defines the external API** and each subsequent middleware transforms for the next:

```typescript
// First middleware (outermost): defines external API types
const apiLayer: Middleware<
  { userId: string; token: string },  // External API input
  { status: string; data: User },     // External API output
  number,                              // Pass to next middleware
  User                                 // Receive from next middleware
> = async (input, next, token) => {
  if (input.token !== 'valid') {
    return { status: 'error', data: null };
  }
  const user = await next(parseInt(input.userId));
  return { status: 'ok', data: user };
};

// Second middleware (closer to handler)
const validationLayer: Middleware<
  number,  // Receive from previous middleware
  User,    // Return to previous middleware
  number,  // Pass to handler (same type here)
  User     // Receive from handler (same type here)
> = async (input, next, token) => {
  if (input <= 0) throw new Error('Invalid ID');
  return await next(input);
};

const app = api(container())
  .register('get_user')
  .as<number, User>()  // Handler types
  .middleware(compound(apiLayer, validationLayer))
  .using(userHandler);

// External API signature: { userId: string; token: string } → { status: string; data: User }
await app.get_user({ userId: '123', token: 'valid' });
```

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
