# Changelog

All notable changes to Bambuddy will be documented in this file.

## [0.1.6b12] - 2026-01-16

### Added
- **Project parts tracking** - Track individual parts/objects separately from print plates:
  - New "Target Parts" field in project create/edit modal alongside "Target Plates"
  - Separate progress bars for plates (print jobs) vs parts (objects printed)
  - Parts count auto-detected from 3MF files when archiving prints
  - Project cards show both plates and parts counts in footer stats
  - Example: Voron build with 25 plates producing 150 parts total
  - Closes [#85](https://github.com/maziggy/bambuddy/issues/85)
- **Archive quantity auto-detection** - Automatically set parts count when archiving:
  - Extracts printable object count from 3MF `slice_info.config`
  - Respects skipped objects (not counted)
  - Falls back to 1 if extraction fails
- **Migration script for existing archives** - Update quantities on existing archives:
  - Run `python scripts/update_archive_quantities.py` to update existing archives
  - Use `--dry-run` flag to preview changes without applying them
  - Parses 3MF files to extract correct object counts

### Changed
- Project stats now correctly distinguish between plates (archive count) and parts (sum of quantities)
- Project list `completed_count` now represents parts printed, not print jobs
- Progress calculations: plates use `archive_count/target_count`, parts use `completed_count/target_parts_count`

## [0.1.6b11] - 2026-01-13

### Added
- **MQTT Publishing** - Publish BamBuddy events to external MQTT brokers for integration with Home Assistant, Node-RED, and other automation platforms:
  - New "Network" tab in Settings (between Filament and API Keys)
  - Configure broker hostname, port, username/password, TLS, and topic prefix
  - Auto-populate port when toggling TLS (1883 ↔ 8883)
  - Real-time connection status indicator in tab and settings card
  - Published topics include:
    - `bambuddy/status` - Online/offline status
    - `bambuddy/printers/{serial}/status` - Real-time printer state (throttled to 1/sec)
    - `bambuddy/printers/{serial}/print/started|completed|failed` - Print lifecycle events
    - `bambuddy/printers/{serial}/ams/changed` - AMS filament changes
    - `bambuddy/queue/job_added|job_started|job_completed` - Print queue events
    - `bambuddy/maintenance/alert|reset` - Maintenance notifications
    - `bambuddy/smart_plugs/on|off|energy` - Smart plug state changes
    - `bambuddy/archive/created|updated` - Archive events
  - Supports TLS/SSL encryption with self-signed certificates
  - Auto-reconnect when settings change
  - Settings included in backup/restore
- **FTP Retry moved to Network tab** - FTP retry settings relocated from General to Network tab for better organization

## [0.1.6b10] - 2026-01-11

### Added
- **AMS color mapping** - Manually select which AMS slot to use for each filament:
  - ReprintModal: Click dropdown to override auto-matched slots
  - AddToQueueModal: Collapsible filament mapping section with slot selection
  - Mapping stored with queued prints and used when print starts
  - Blue ring indicator shows manually selected slots vs auto-matched
  - Status indicators: green (match), yellow (type only), orange (not found)
  - Re-read button to refresh AMS status if spools were swapped
  - Color names shown in dropdowns and tooltips (decoded from Bambu filament codes or derived from hex)

## [0.1.6b9] - 2026-01-09

### Added
- **Chamber light control** - Toggle the printer's chamber LED from the UI:
  - Light button next to camera button at bottom of printer card
  - Custom icon with on/off states (yellow when lit)
  - Works on all Bambu Lab printers (X1, P1, A1 series, H2D)
  - H2D dual chamber lights controlled together
- **Archive list view improvements** - Full feature parity with card view:
  - Edit and delete buttons inline with each row
  - Three-dot menu button for context menu access
  - All context menu actions (re-print, compare, add to project, etc.)
- **Archive object count** - Shows number of printable objects on archive cards:
  - Displays in stats grid (e.g., "3 objs")
  - Extracted from 3MF metadata automatically
- **Cross-view archive highlight** - Click an archive in calendar or project view to highlight it:
  - Switches to card/list view and scrolls to the archive
  - Yellow border highlight for 5 seconds
  - Works in card, list, and calendar views
- **Context menu visual indicator** - Three-dot button on cards and list items:
  - Shows on hover (desktop) or always visible (mobile)
  - Provides quick access to context menu actions
  - Positioned on left side for easy access
- **Spoolman location clearing** - When spools are removed from AMS, their location field is now cleared in Spoolman:
  - Previously, location persisted even after spool removal
  - Now correctly clears "Printer Name - AMS X Slot Y" when spool is no longer present
- **FTP retry for unreliable WiFi** - Configurable retry logic for all FTP operations:
  - Enable/disable retry in Settings > General > FTP Retry
  - Configure retry count (1-10 attempts) and delay (1-30 seconds)
  - Configurable connection timeout (10-120 seconds, default 30s)
  - Applies to: 3MF archiving, print uploads, timelapse downloads, firmware updates
  - Helps P1S, X1C, and other printers with weak WiFi connections
- **A1/A1 Mini FTP fix** - Resolved FTP upload failures on A1 series printers:
  - A1 printers have issues with SSL on the FTP data channel
  - Automatic detection skips data channel SSL for A1 and A1 Mini models
  - Control channel remains encrypted via implicit FTPS (port 990)
  - Fixes "read operation timed out" errors during file uploads
- **Bulk project assignment** - Assign multiple archives to a project at once:
  - New "Project" button in multi-select toolbar (next to Tags)
  - Select a project to assign all selected archives
  - "Remove from project" option to clear assignments
  - Updates Projects page and Project Detail page instantly

### Fixed
- **Time format setting not applied** - Fixed 24-hour time format not being respected across the UI:
  - ETA display on printer cards now uses configured time format
  - Archive cards and timelapse file lists respect the setting
  - AMS history charts use the configured format
  - Project timeline, queue page, notification logs, and system info all updated
  - Settings > General > Time Format now works consistently everywhere
- **QR code endpoint** - Fixed 500 error on archive QR code generation:
  - Added `qrcode[pil]` to requirements.txt
  - Improved error handling for missing dependencies
  - Fixed PIL Image resizing method

## [0.1.6b8] - 2026-01-08

### Added
- **Reprint modal print options** - Configure print settings when reprinting from archive:
  - Bed leveling toggle (default: enabled)
  - Flow calibration toggle (default: disabled)
  - Vibration calibration toggle (default: enabled)
  - First layer inspection toggle (default: disabled)
  - Timelapse recording toggle (default: disabled)
  - Collapsible "Print Options" section with toggle switches
  - Settings sent to printer match Bambu Studio's format exactly

### Fixed
- **AMS mapping for multi-color reprints** - Fixed filament slot mapping for multi-color prints:
  - AMS mapping now matches Bambu Studio's exact format with `ams_mapping2` detailed structure
  - Correct handling of 3MF filament slot IDs (1-indexed to 0-indexed conversion)
  - Unused filament slots properly filled with `-1` placeholder
  - Prevents duplicate tray assignment when multiple filaments match the same type
  - Resolves "stuck at filament change" issue on X1C and other multi-AMS printers
- **Print command format** - Updated MQTT print command to match Bambu Studio exactly:
  - Added `auto_bed_leveling`, `cfg`, `extrude_cali_flag`, `extrude_cali_manual_mode`, `nozzle_offset_cali` fields
  - Uses American spelling `bed_leveling` (not British `bed_levelling`)
  - Proper `sequence_id` format matching official apps

## [0.1.6b7] - 2026-01-04

### Added
- **Support bundle for issue reporting** - Collect debug logs and system info for troubleshooting:
  - Toggle debug logging from System Information page
  - Debug logging indicator banner shows across all pages with live timer
  - Download support bundle as ZIP file with sanitized logs and system info
  - Privacy-focused: filters sensitive data (passwords, tokens, emails, IPs)
  - Clear explanation of what data is/isn't collected
- **Firmware update helper** - Check and upload firmware updates for LAN-only printers:
  - Automatic firmware update checking against Bambu Lab's servers
  - Orange "Update" badge on printer cards when updates are available
  - Click badge to open firmware update modal with version info and release notes
  - One-click firmware upload to printer's SD card via FTP
  - Real-time upload progress tracking with actual bytes transferred
  - Step-by-step instructions for triggering update from printer screen
  - Supports all Bambu Lab printer models (X1C, X1, X1E, P1S, P1P, P2S, A1, A1 Mini, H2D, H2C, H2S)
  - Firmware files cached locally for faster re-uploads

## [0.1.6b6] - 2026-01-04

### Added
- **Resizable printer cards** - Adjust printer card size from the Printers page toolbar:
  - Four sizes: Small, Medium (default), Large, XL
  - Plus/minus buttons in toolbar header
  - Size preference saved to localStorage
  - Responsive grid adapts to selected size
- **Queue Only mode** - Stage prints without automatic scheduling:
  - New "Queue Only" option when adding prints to queue
  - Staged prints show purple "Staged" badge
  - Play button to manually release staged prints to the queue
  - Edit queue items to switch between ASAP, Scheduled, and Queue Only modes
  - Useful for preparing print batches before activating
- **Virtual printer model selection** - Choose which Bambu printer model to emulate:
  - Dropdown in Settings > Virtual Printer to select model
  - Supports X1 series (X1C, X1, X1E), P series (P1S, P1P, P2S), A1 series (A1, A1 Mini), and H2 series (H2D, H2C, H2S)
  - Affects how slicers detect and interact with the virtual printer
  - Model change automatically restarts the virtual printer (no manual disable/enable needed)
  - Models sorted alphabetically in dropdown
- **Pending upload delete confirmation** - Confirmation modal when discarding pending uploads in queue review mode
- **Tasmota admin link** - Direct link to Tasmota web interface on smart plug cards:
  - Auto-login using stored credentials (when available)
  - Opens in new tab for quick access to plug settings
- **Debug logging** - Added debug logging for printer hour counter and AMS slot mapping
- **Demo video recorder** - Playwright-based tool for recording demo videos:
  - Automated walkthrough of all pages
  - Outputs WebM format, easy conversion to MP4
  - Located in `demo-video/` directory

### Fixed
- **Camera stream reconnection** - Improved detection of stuck camera streams with automatic reconnection:
  - Periodic stall detection checks every 5 seconds
  - Automatic reconnection when stream stops receiving frames
  - New `/api/v1/printers/{id}/camera/status` endpoint for stream health monitoring
- **Spoolman sync** - Fixed sync issues with Spoolman integration:
  - Now only matches Bambu Lab vendor filaments when syncing
  - Prevents incorrect matching with third-party filaments by color alone
  - Improved filament matching accuracy
- **Archive card context menu** - Fixed context menu positioning issues (#46)
- **Printer card cover image** - Fixed wrong cover image displayed for multi-plate print files
- **Skip objects modal** - Fixed object ID markers not correctly positioned over build plate preview:
  - Now uses `bbox_all` from plate metadata for accurate coordinate mapping
  - Markers correctly position relative to the actual object bounds in the preview image
  - Works correctly for multi-plate projects
- **Active AMS slot display (H2D)** - Fixed incorrect slot display on H2D printers with multiple AMS units:
  - Now parses `snow` field from `device.extruder.info` which contains actual AMS ID
  - Previously picked first AMS on the extruder, causing wrong display when multiple AMS connected
  - Example: Switching from B2 to C1 now correctly shows C1 instead of A1
- **Spoolman link function** - Improved "Link to Spoolman" in AMS slot detail modal
- **GCode viewer** - Minor improvements to GCode visualization
- **Cover image retrieval** - Improved reliability of cover image extraction
- **Virtual printer SSDP model codes** - Corrected model codes for slicer compatibility:
  - C11=P1P, C12=P1S (were incorrectly swapped)
  - N7=P2S (was incorrectly using C13 which is X1E)
  - 3DPrinter-X1-Carbon for X1C (full model name format)
- **Virtual printer serial prefixes** - Fixed serial number prefixes to match real printers:
  - Based on actual Bambu Lab serial number format (MMM??RYMDDUUUUU)
  - X1C=00M, P1S=01P, P1P=01S, P2S=22E, A1=039, A1M=030, H2D=094, X1E=03W
- **Virtual printer startup model** - Fixed model not loading from database on container restart:
  - Virtual printer now correctly restores the saved model on startup
  - Previously always started with default X1C model regardless of saved setting
- **Virtual printer model change** - Fixed model changes not taking effect while running:
  - Model changes now automatically restart the virtual printer
  - Removed frontend restriction that required manual disable/enable
- **Docker certificate persistence** - Fixed virtual printer certificate storage:
  - Removed unused `bambuddy_vprinter` volume (was mounting to wrong path)
  - Certificates now correctly persist in `bambuddy_data` volume
  - Added optional bind mount for sharing certs between Docker and native installations

### Changed
- **Virtual printer setup documentation** - Improved setup instructions:
  - Prominent "Setup Required" warning in UI linking to documentation
  - Certificate must **replace** the last cert in slicer's printer.cer file (not append!)
  - Clear guidance: one CA only per slicer, replace when switching hosts
  - Platform-specific instructions for Linux, Docker, macOS, Windows, Unraid, Synology, TrueNAS, Proxmox
  - Added troubleshooting for TLS connection errors

### Tests
- Added integration tests for print queue API endpoints (16 new tests)
- Tests cover queue CRUD, manual_start flag, and start/cancel endpoints
- Added unit tests for virtual printer model configuration (3 new tests)
- Updated VirtualPrinterSettings tests for new UI layout and model codes
- Fixed virtual printer tests with outdated model codes (BL-P001 → 3DPrinter-X1-Carbon)

## [0.1.6b5] - 2026-01-02

### Added
- **Pre-built Docker images** - Ready-to-use container images on GitHub Container Registry:
  - Pull directly: `docker pull ghcr.io/maziggy/bambuddy:latest`
  - Multi-architecture support: `linux/amd64` and `linux/arm64` (Raspberry Pi 4/5)
  - No build required - just `docker compose up -d`
  - Automatic architecture detection - Docker pulls the right image for your system
- **Spoolman Link Spool feature** - Manually link existing Spoolman spools to AMS trays:
  - Hover over any AMS slot to see "Link to Spoolman" button (when Spoolman enabled)
  - Select from list of unlinked Spoolman spools
  - Automatically sets the `extra.tag` field in Spoolman for proper sync
  - Useful for connecting existing Spoolman inventory to physical spools
- **Spool UUID display** - View and copy Bambu Lab spool UUID in AMS hover card:
  - Shows first 8 chars of UUID with copy button
  - Full UUID copied to clipboard (with fallback for HTTP contexts)
  - Only visible when Spoolman integration is enabled
- **Spoolman sync feedback** - Improved sync result display:
  - Shows count of successfully synced spools
  - Lists skipped spools with reasons (e.g., "Non-Bambu Lab spool")
  - Expandable list when more than 5 spools skipped
  - Color swatches for easy identification
- **Printer control buttons** - Stop and Pause/Resume buttons on printer cards when printing:
  - Stop button cancels the current print job
  - Pause/Resume toggle for pausing and resuming prints
  - Confirmation modals for all actions to prevent accidental clicks
  - Toast notifications for action feedback
- **Skip objects** - Skip individual objects during a print:
  - Skip button in print status section (top right) when printing with 2+ objects
  - Modal shows preview image with object ID markers overlaid
  - Large ID badges to easily match with printer display
  - Click to skip any object - it will not be printed
  - Skipped objects shown with strikethrough styling and red badge on button
  - Skip only available after layer 1 (printer limitation) with warning message
  - Objects automatically loaded when print starts from 3MF metadata
  - Parses skipped objects from printer MQTT for state persistence
  - Light and dark theme support
  - Close with ESC key or click outside
  - Requires "Exclude Objects" option enabled in slicer
- **Interactive API Browser** - Explore and test all API endpoints directly in Bambuddy:
  - Settings → API Keys now includes a full API browser
  - Fetches OpenAPI schema automatically
  - Endpoints grouped by category (printers, archives, settings, etc.)
  - Expandable sections with color-coded method badges (GET, POST, PATCH, DELETE)
  - Parameter inputs for path, query, and JSON body
  - Auto-populates request body with schema examples
  - Live API execution with response display (status, timing, formatted JSON)
  - Paste API key to test authenticated endpoints
  - Search to filter endpoints across all categories
  - Two-column layout: API key management + API browser side-by-side
- **AMS slot RFID re-read** - Re-read RFID data for individual AMS slots:
  - Menu button (⋮) appears on hover over AMS slots
  - "Re-read RFID" option triggers filament info refresh
  - Loading indicator shows while re-read is in progress
  - Automatically tracks printer status to clear indicator when complete
  - Menu hidden when printer is busy (printing)
- **Print quantity tracking** - Track number of items per print job for project progress:
  - Set "Items Printed" quantity when editing archived prints
  - Project stats now show total items vs print jobs
  - Progress bar tracks items toward target count
  - Useful for batch printing (e.g., 10 copies in one print = 10 items)
  - Default quantity of 1 for backwards compatibility
- **Fan status display** - Real-time fan speeds in new Controls section:
  - Part cooling fan, Auxiliary fan, Chamber fan status
  - Distinct icons for each fan type (Fan, Wind, AirVent)
  - Dynamic coloring: active fans show colored, off fans show gray
  - Percentage display (0-100%)
  - Real-time updates via WebSocket
  - Always visible on printer cards in expanded view

### Changed
- **Printer card layout** - Reorganized expanded view with new Controls section:
  - Temperature display is now standalone (no longer shares row with buttons)
  - New Controls section contains fan status (left) and print buttons (right)
  - Removed divider lines before Controls and Filaments sections for cleaner look
- **Cover image availability** - Print cover image now shown in PAUSE/PAUSED states (not just RUNNING) for skip objects modal
- **Spoolman info banner** - Updated settings UI with clearer sync documentation

### Fixed
- **Spoolman spool creation** - Fixed 400 Bad Request error when creating new spools:
  - Spoolman `extra` field values must be valid JSON
  - Now properly JSON-encodes the `tag` value
  - Affects both auto-sync and manual link operations

### Tests
- Added integration tests for printer control endpoints (stop, pause, resume)
- Added integration tests for AMS slot refresh endpoint
- Added integration tests for skip objects endpoints (get objects, skip objects, objects with positions)

## [0.1.6b4] - 2026-01-01

### Added
- **Docker update detection** - Automatically detects Docker installations and shows appropriate update instructions instead of failing with git errors
- **Camera popup window improvements**
  - Auto-resize to fit video resolution on first open
  - Persist window size and position to localStorage
  - Restore saved window state for subsequent opens
- **Slicer protocol handler** - OS detection for correct protocol (Windows: `bambustudio://`, macOS/Linux: `bambustudioopen://`)

### Fixed
- **Maintenance duration display** - Show weeks instead of imprecise months for better countdown precision
- **Print hours display** - Convert large hour values to readable units (e.g., 478h → 3w, 100h → 4d)
- **Printer hour counter** - Fixed runtime_seconds not incrementing during prints (first timestamp was set but never committed)

### Changed
- **Printer cards** - Refactored AMS section for better visual grouping and spacing

## [0.1.6b3] - 2025-12-31

### Added
- **Customizable Theme System** - Comprehensive theme customization with independent settings for dark and light modes:
  - **Style**: Classic (clean shadows), Glow (accent-colored glow effects), Vibrant (dramatic deep shadows)
  - **Background**: Neutral, Warm, Cool (light mode) + OLED, Slate, Forest (dark mode only)
  - **Accent Colors**: Green, Teal, Blue, Orange, Purple, Red
  - All combinations work together (e.g., Glow style + Forest background + Teal accent)
  - Settings sync across devices via database
  - Live preview in Settings → Appearance

### Fixed
- **Printer hour counter** - Fixed bug in printer's hour counter display

### Changed
- **Sidebar power switch** - Added confirmation modal to sidebar's quick power switch

## [0.1.6b2] - 2025-12-29

### Added
- **Virtual Printer** - Bambuddy now emulates a Bambu Lab printer on your network! Send prints directly from Bambu Studio or Orca Slicer without needing a physical printer connection. Features include:
  - SSDP discovery (printer appears automatically in slicer)
  - Secure TLS/MQTT communication with auto-generated certificates
  - Queue mode (prints go to pending uploads) or auto-start mode
  - Configurable access code for authentication
  - Works with Docker (requires `network_mode: host`)
  - Persistent certificates across container rebuilds via volume mount

### Fixed
- **Backup/restore for virtual printer settings** - Virtual printer settings (enabled, access code, mode) now correctly persist after restore without being overwritten by auto-save

## [0.1.6b] - 2025-12-28

### Added
- **Tasmota device discovery** - Automatically discover Tasmota smart plugs on your network. Click "Discover Tasmota Devices" in the Add Smart Plug modal to scan your local subnet. Supports devices with and without authentication.
- **Switchbar for quick smart plug access** - New sidebar widget for controlling smart plugs without leaving the current page. Enable "Show in Switchbar" for any plug to add it to the quick access panel. Shows real-time status, power consumption, and on/off controls.
- **Timelapse editor** - Edit timelapse videos with trim, speed adjustment (0.25x-4x), and music overlay. Uses FFmpeg for server-side processing with browser-based preview.
- **AMS filament preview** - Reprint modal shows filament comparison between what the print requires and what's currently loaded in the AMS. Compares both type and color with visual indicators (green=match, yellow=color mismatch, orange=type mismatch). Includes Re-read button to refresh AMS status from printer, fuzzy color matching for similar colors, and shows AMS slot location for each matched filament.
- **File type badge** - Archive cards now show GCODE (green) or SOURCE (orange) badge to indicate whether the file is a sliced print-ready file or source-only.
- **Docker printer discovery** - Subnet scanning for discovering printers when running in Docker with `network_mode: host`. Automatically detects Docker environment and shows subnet input field in Add Printer dialog.
- **Printer model mapping** - Discovery now shows friendly model names (X1C, H2D, P1S) instead of raw SSDP codes (BL-P001, O1D, C11).
- **Discovery API tests** - Comprehensive test coverage for discovery endpoints.
- **Project filament colors** - Project cards now display filament color swatches from assigned archives.
- **BOM filter** - Hide completed BOM items with "Hide done" toggle on project detail page.
- **Projects in backup/restore** - Projects, BOM items, and attachments now included in database backup/restore.
- **Attachment file validation** - File type validation for project attachments (images, documents, 3D files, archives, scripts, configs).

### Changed
- **Timelapse viewer** - Default playback speed changed from 2x to 1x.
- **GitHub issue template** - Added mandatory printer firmware version field and LAN-only mode checkbox for better bug reports.
- **Docker compose** - Clearer comments explaining `network_mode: host` requirement for printer discovery and camera streaming.
- **Project card design** - Enhanced visual polish with gradients, shadows, and glow effects on hover.
- **Project page layout** - Improved spacing and padding on project list and detail pages.
- **Delete confirmations** - Replaced browser confirm dialogs with styled confirmation modals.

### Fixed
- **Notification module** - Fixed bug where notifications were sent even when printer was offline.
- **Attachment uploads** - Fixed file attachments not persisting due to SQLAlchemy JSON column mutation detection.
- **Camera stream stability** - Fixed stream stopping after a few minutes by increasing ffmpeg read timeout (10s→30s), adding buffer options, and implementing auto-reconnection with exponential backoff in the frontend.

## [0.1.5] - 2025-12-19

### Fixed
- **Browser freeze on print completion** - Fixed freeze when camera stream was open during print completion by using buffered camera frames instead of spawning duplicate ffmpeg processes
- **Printer status "timelapse" effect** - Fixed issue where navigating to printer page after print showed metrics animating slowly from mid-print values to final state; printer_status messages now bypass the throttled queue
- **Timelapse auto-download** - Complete rewrite with retry mechanism and multiple path support
- **Timelapse detection for H2D** - H2D sends timelapse status in ipcam.timelapse field, not xcam.timelapse
- **Reprint from archive** - Fixed bug where print button sent slicer source file instead of sliced gcode
- **Import shadowing bugs** - Fixed ArchiveService import shadowing causing "cannot access local variable" error
- **Timelapse race condition** - xcam data was parsed before print state was set

### Added
- **Failure reason detection** - Auto-detects failure reasons from HMS errors:
  - Filament runout (Module 0x07)
  - Layer shift (Module 0x0C)
  - Clogged nozzle (Module 0x05)
- **Hide failed prints filter** - Toggle to hide failed/aborted prints with localStorage persistence
- **Docker test suite** - Comprehensive tests for build, backend, frontend, and integration
- **Pre-commit hooks** - Ruff linter and formatter for code quality
- **Code quality tests** - Static analysis to catch import shadowing bugs automatically

### Changed
- **Timelapse viewer** - Default playback speed changed from 0.5x to 2x
- **Archive badges** - Shows "cancelled" for aborted prints, "failed" for failed prints
- **WebSocket optimization** - Removed large raw_data field from print_complete message; reduced throttle to 100ms for smoother updates

### Docker
- Added ffmpeg to Docker image
- Fixed build warnings (debconf, pip root user)
- Added comprehensive Docker documentation to README
- Added `--pull` flag to ensure fresh base images

## [0.1.5b6] - 2025-12-12

  Notifications:
  - Separate AMS and AMS-HT notification switches (one per device type)
  - Fix notification variables not showing (duration, filament, estimated_time)
  - Add fallback values for empty notification variables ("Unknown" instead of blank)

  Settings:
  - Fix API keys badge count only showing after visiting tab
  - Move External Links card to third column above Updates
  - Add Release Notes modal for viewing full notes before updating

  Statistics:
  - Fix filament usage trends not showing (wrong API parameters)
  - Move dashboard controls (Hidden, Reset Layout) to header row

  Camera:
  - Fix ffmpeg processes not killed when closing webcam window
  - Add /camera/stop endpoint with POST support for sendBeacon
  - Track active streams and proper cleanup on disconnect

  Documentation:
  - Update README with missing features (camera streaming, AMS/AMS-HT monitoring,
    chamber control, printer control, AI detection, calibration, energy tracking,
    database backup/restore, system info dashboard)

## [0.1.5b5] - 2025-12-11

### Added
- Anonymous telemetry system with opt-out support
- System info page with database and resource statistics

## [0.1.5b4] - 2025-12-11

New Features

    Mobile PWA Support - Progressive Web App support for mobile devices
    AMS Humidity/Temperature History - Clickable indicators open charts with 6h/24h/48h/7d history, min/max/avg statistics, and threshold reference lines
    Webhooks & API Keys - API key authentication with granular permissions for external integrations
    System Info Page - New page showing system information
    Multi-plate Cover Image - Archive cards now show cover image of the printed plate for multi-plate files
    Quick Notification Disable - Button to quickly disable notifications
    Projects / Print Grouping - Group related prints into projects with progress tracking
    Full-Text Search (FTS5) - Efficient search across print names, filenames, tags, notes, designer, and filament type
    Failure Analysis - Dashboard widget showing failure rate with correlations and trends
    Archive Comparison - Compare 2-5 archives side-by-side with highlighted differences
    CSV/Excel Export - Export archives and statistics with current filters

Improvements

    Improved archive card context menu with submenu support
    Improved notification scheduler and templates
    Improved auto power off scheduler
    Improved email notification provider
    Configurable AMS data retention (default 30 days)

Bug Fixes

    Fixed bug where not all AMS spools were synced to Spoolman
    Fixed bug where external links were not respected by hotkeys
    Fixed context menu submenu not showing
    Fixed project card thumbnails using correct API endpoint
    Fixed archive PATCH 500 error (FTS5 index rebuild)
    Fixed clipboard API fallback for HTTP contexts

Infrastructure

    Added comprehensive automated testing (pytest, vitest, playwright)
    GitHub Actions CI/CD workflow for automated testing
    Removed PWA push notifications

## [0.1.5b4] - 2025-12-10

### Added
- Docker support with containerized deployment
- Comprehensive mobile support with responsive navigation
  - Hamburger drawer navigation for mobile (< 768px)
  - Touch gesture context menus with long press support
  - WCAG-compliant touch targets (44px minimum)
  - Safe area insets support for notched devices
- External links can be embedded into sidebar navigation
- External links included in backup/restore module
- Filament spool fill levels on printer cards
- Issue and pull request templates

### Changed
- Improved external link module with better icon layout
- Documentation moved to separate repository

### Fixed
- Notification module now properly saves newly added notification types
- External link icons layout improvements

## [0.1.5b3] - 2025-12-09

### Added
- Comprehensive backup/restore module improvements

### Fixed
- Switched off printers no longer incorrectly show as active
- os.path issue in update module

## [0.1.5b2] - 2025-12-09

### Added
- User options to backup module

### Changed
- App renamed to "Bambuddy"

### Fixed
- HTTP 500 error in backup module

## [0.1.5b] - 2025-12-08

### Added
- Smart plug monitoring and scheduling
- Daily digest notifications
- Notification template system
- Maintenance interval type: calendar days
- Cloud Profiles template visibility and preset diff view
- AMS humidity/temperature indicators with configurable thresholds
- Printer image on printer card
- WiFi signal strength indicator on printer card
- Power switch dropdown for offline printers
- MQTT debug viewer with filter and search
- Total printer hours display on printer card
- AMS discovery module
- Dual-nozzle AMS wiring visualization

### Changed
- Redesigned AMS section with BambuStudio-style device icons
- Tabbed design and auto-save for settings page
- Replaced camera settings with WiFi signal in top bar
- Completely refactored K-profile module
- Refactored maintenance settings

### Fixed
- HMS module bug
- Camera buttons appearance in light theme

### Removed
- Control page (removed all related code)

## [0.1.4] - 2025-12-01

### Added
- Multi-language support
- Auto app update functionality
- Maintenance module with notifications
- Spoolman support for adding unknown Bambu Lab spools
- Source 3MF file upload to archive cards

### Fixed
- K profiles retrieval from printer

## [0.1.3] - 2025-11-30

### Added
- Push notification support (WhatsApp, ntfy, Pushover, Telegram, Email)
- K profile management
- Configurable logging with log levels
- Sidebar item reordering
- Default view settings
- Option to track energy per print or in total
- Timelapse viewer improvements

### Fixed
- WebSocket connection stability
- Power stage updates not reflecting in frontend

## [0.1.2-bugfix] - 2025-11-30

### Fixed
- WebSocket disconnection issues

## [0.1.2-final] - 2025-11-29

### Added
- Print scheduling and queueing system
- Power consumption cost calculation
- HMS (Health Management System) error handling on printer cards
- Camera snapshot on print completion
- Power switch and automation controls on printer card
- Timelapse video player with speed controls
- Print time accuracy calculation
- Duplicate detection and filtering

### Changed
- Unified printer card layout

### Fixed
- Auto poweroff feature improvements
- Archive file handling on print start
- Statistics display issues

## [0.1.2] - 2025-11-28

### Added
- HMS health status monitoring
- MQTT debug log window
- Tasmota smart power plug support with automation
- Project page viewer and editor
- Button to show/hide disconnected printers
- Favicons

### Fixed
- Collapsed sidebar layout

## [0.1.1] - 2025-11-28

### Added
- Initial public release
- Multi-printer support via MQTT
- Real-time printer status monitoring
- Print archives with history tracking
- Statistics and analytics dashboard
- Timelapse video support
- Light and dark theme support

---

For more information, visit the [Bambuddy GitHub repository](https://github.com/maziggy/bambuddy).
