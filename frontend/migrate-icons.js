const fs = require('fs');
const path = require('path');

// Mapping from Lucide icon names to MDI path variable names
const ICON_MAPPING = {
  'AlertCircle': 'mdiAlertCircle',
  'AlertTriangle': 'mdiAlert',
  'ArrowLeft': 'mdiArrowLeft',
  'ArrowRight': 'mdiArrowRight',
  'ArrowUp': 'mdiArrowUp',
  'ArrowDown': 'mdiArrowDown',
  'ArrowUpDown': 'mdiSwapVertical',
  'Bell': 'mdiBell',
  'Building2': 'mdiOfficeBuilding',
  'Calendar': 'mdiCalendar',
  'CalendarDays': 'mdiCalendarMonth',
  'Check': 'mdiCheck',
  'CheckCircle': 'mdiCheckCircle',
  'CheckCircle2': 'mdiCheckCircle',
  'ChevronDown': 'mdiChevronDown',
  'ChevronLeft': 'mdiChevronLeft',
  'ChevronRight': 'mdiChevronRight',
  'ChevronUp': 'mdiChevronUp',
  'Circle': 'mdiCircle',
  'Clock': 'mdiClock',
  'CreditCard': 'mdiCreditCard',
  'DollarSign': 'mdiCurrencyUsd',
  'Edit': 'mdiPencil',
  'Edit2': 'mdiPencil',
  'ExternalLink': 'mdiOpenInNew',
  'Eye': 'mdiEye',
  'EyeOff': 'mdiEyeOff',
  'FileText': 'mdiFileDocument',
  'Filter': 'mdiFilter',
  'Globe': 'mdiWeb',
  'GripVertical': 'mdiDragVertical',
  'Home': 'mdiHome',
  'Image': 'mdiImage',
  'ImageIcon': 'mdiImage',
  'Info': 'mdiInformation',
  'LayoutGrid': 'mdiViewGrid',
  'Loader2': 'mdiLoading',
  'Lock': 'mdiLock',
  'LogIn': 'mdiLogin',
  'LogOut': 'mdiLogout',
  'Mail': 'mdiEmail',
  'MapPin': 'mdiMapMarker',
  'Maximize2': 'mdiArrowExpand',
  'Menu': 'mdiMenu',
  'Minimize2': 'mdiArrowCollapse',
  'Minus': 'mdiMinus',
  'MoreVertical': 'mdiDotsVertical',
  'Navigation': 'mdiNavigation',
  'Package': 'mdiPackageVariant',
  'Pencil': 'mdiPencil',
  'Phone': 'mdiPhone',
  'Plus': 'mdiPlus',
  'PlusCircle': 'mdiPlusCircle',
  'Receipt': 'mdiReceipt',
  'RefreshCw': 'mdiRefresh',
  'RotateCcw': 'mdiRestart',
  'Save': 'mdiContentSave',
  'Scale': 'mdiScale',
  'Search': 'mdiMagnify',
  'Settings': 'mdiCog',
  'ShieldAlert': 'mdiShieldAlert',
  'ShoppingCart': 'mdiCart',
  'Star': 'mdiStar',
  'Store': 'mdiStore',
  'Table': 'mdiTable',
  'Tag': 'mdiTag',
  'Trash': 'mdiDelete',
  'Trash2': 'mdiDelete',
  'TrendingDown': 'mdiTrendingDown',
  'TrendingUp': 'mdiTrendingUp',
  'Truck': 'mdiTruck',
  'Upload': 'mdiUpload',
  'User': 'mdiAccount',
  'Users': 'mdiAccountGroup',
  'Utensils': 'mdiSilverwareForkKnife',
  'X': 'mdiClose',
  'XCircle': 'mdiCloseCircle',
  'BarChart3': 'mdiChartBar',
  'Sparkles': 'mdiSparkles',
  'AlarmClock': 'mdiAlarmClock',
  'Wrench': 'mdiWrench',
  'Power': 'mdiPower',
};

// Size mapping from Tailwind classes to MDI sizes
function getSizeFromClass(className) {
  const sizeMatch = className.match(/h-(\d+)/);
  if (sizeMatch) {
    const tailwindSize = parseInt(sizeMatch[1]);
    // Tailwind h-4 = 16px = 0.67 size
    // Tailwind h-5 = 20px = 0.83 size
    // Tailwind h-6 = 24px = 1 size
    // Tailwind h-8 = 32px = 1.33 size
    // Tailwind h-10 = 40px = 1.67 size
    // Tailwind h-12 = 48px = 2 size
    return (tailwindSize / 6).toFixed(2);
  }
  return '0.67';
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if file uses lucide-react
  if (!content.includes('from "lucide-react"')) {
    return false;
  }
  
  console.log(`Processing: ${filePath}`);
  
  // Extract lucide imports
  const lucideImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["'];?/);
  if (!lucideImportMatch) {
    console.log(`  Skipping: Complex import pattern`);
    return false;
  }
  
  const importedIcons = lucideImportMatch[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('type ') && s !== 'type LucideIcon')
    .map(s => {
      // Handle "Image as ImageIcon" style imports
      const asMatch = s.match(/(\w+)\s+as\s+(\w+)/);
      if (asMatch) {
        return { original: asMatch[1], alias: asMatch[2] };
      }
      return { original: s, alias: s };
    });
  
  // Check if all icons are mappable
  const unmappedIcons = importedIcons.filter(i => !ICON_MAPPING[i.original]);
  if (unmappedIcons.length > 0) {
    console.log(`  Warning: Unmapped icons: ${unmappedIcons.map(i => i.original).join(', ')}`);
  }
  
  // Generate MDI import
  const mdiImports = importedIcons
    .filter(i => ICON_MAPPING[i.original])
    .map(i => ICON_MAPPING[i.original]);
  
  const uniqueMdiImports = [...new Set(mdiImports)];
  
  if (uniqueMdiImports.length === 0) {
    console.log(`  Skipping: No mappable icons`);
    return false;
  }
  
  // Replace import statement
  const newImport = `import Icon from "@mdi/react";
import { ${uniqueMdiImports.join(', ')} } from "@mdi/js";`;
  
  content = content.replace(lucideImportMatch[0], newImport);
  
  // Also remove any "type LucideIcon" references
  content = content.replace(/import\s+type\s+\{\s*LucideIcon\s*\}\s+from\s+["']lucide-react["'];?\n?/g, '');
  content = content.replace(/: LucideIcon/g, ': string');
  content = content.replace(/icon: React\.ComponentType<\{ className\?: string \}>/g, 'iconPath: string');
  
  // Replace icon usages
  for (const icon of importedIcons) {
    if (!ICON_MAPPING[icon.original]) continue;
    
    const mdiPath = ICON_MAPPING[icon.original];
    const iconName = icon.alias;
    
    // Pattern: <IconName className="..." />
    const iconPattern = new RegExp(`<${iconName}\\s+className=["']([^"']+)["']\\s*/>`, 'g');
    content = content.replace(iconPattern, (match, className) => {
      const size = getSizeFromClass(className);
      // Remove h-X w-X from className
      const cleanedClass = className
        .replace(/h-\d+(\.\d+)?/g, '')
        .replace(/w-\d+(\.\d+)?/g, '')
        .trim()
        .replace(/\s+/g, ' ');
      
      if (cleanedClass) {
        return `<Icon path={${mdiPath}} size={${size}} className="${cleanedClass}" />`;
      }
      return `<Icon path={${mdiPath}} size={${size}} />`;
    });
    
    // Pattern: <IconName className={...} />
    const iconPatternJsx = new RegExp(`<${iconName}\\s+className=\\{([^}]+)\\}\\s*/>`, 'g');
    content = content.replace(iconPatternJsx, (match, className) => {
      return `<Icon path={${mdiPath}} size={0.67} className={${className}} />`;
    });
    
    // Pattern: icon: IconName (in objects)
    content = content.replace(new RegExp(`icon:\\s*${iconName}([,\\s])`, 'g'), `iconPath: ${mdiPath}$1`);
    
    // Pattern: const Icon = item.icon; <Icon className="..." />
    // This is complex and might need manual handling
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  Migrated successfully`);
  return true;
}

function findFiles(dir, pattern) {
  const results = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules')) {
      results.push(...findFiles(filePath, pattern));
    } else if (file.match(pattern)) {
      results.push(filePath);
    }
  }
  
  return results;
}

// Main
const srcDir = path.join(__dirname, 'src');
const tsxFiles = findFiles(srcDir, /\.tsx$/);

console.log(`Found ${tsxFiles.length} TSX files`);
console.log('');

let processed = 0;
for (const file of tsxFiles) {
  if (processFile(file)) {
    processed++;
  }
}

console.log('');
console.log(`Processed ${processed} files`);

