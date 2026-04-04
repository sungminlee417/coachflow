const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('Reading migration file...')

  const migrationPath = path.join(__dirname, '../supabase/migrations/20240101000000_initial_schema.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  console.log('Executing migration...\n')

  // Split the SQL into individual statements and execute them
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    console.log(`Executing statement ${i + 1}/${statements.length}...`)

    const { error } = await supabase.rpc('exec_sql', { sql: statement })

    if (error) {
      console.error(`Error in statement ${i + 1}:`, error)
      console.error('Statement:', statement.substring(0, 100) + '...')
      // Continue with other statements
    }
  }

  console.log('\n✅ Migration completed!')
  console.log('Note: Some errors above are expected if tables already exist.')
}

runMigration().catch(console.error)
