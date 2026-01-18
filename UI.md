# UI/UX Documentation

## Overview

The Spin Master application uses React with TypeScript for a component-based UI architecture. The interface is designed for managing players, tournaments, and matches with real-time updates.

## Design Principles

1. **Role-Based UI**: Different interfaces for Admins, Organizers, and Players
2. **Real-Time Updates**: Socket.io integration for live data
3. **Modal-Based Forms**: Creation and editing in modal dialogs
4. **Step-by-Step Flows**: Complex operations broken into steps
5. **Responsive Design**: Works on desktop and tablet (mobile optimization needed)

## Component Structure

### Main Components

#### `Players.tsx` (7800+ lines - needs refactoring)
**Purpose**: Main player management and tournament creation interface

**Features**:
- Player list with filtering and sorting
- Player creation/editing
- Tournament creation (all types)
- Match creation for players
- History viewing

**Key Sections**:
1. **Filters**: Name, rating range, active status, gender, birth date
2. **Player Table**: Sortable list of players
3. **Tournament Creation Flow**: Multi-step process
4. **Match Creation**: For organizers and players
5. **History Selection**: View player/opponent history

**Issues**:
- Too large (needs splitting)
- Mixed concerns (UI + business logic)
- Duplicated tournament creation logic

---

#### `Tournaments.tsx`
**Purpose**: Tournament listing and management

**Features**:
- Active and completed tournament lists
- Tournament details view
- Match entry and editing
- Tournament completion
- Bracket visualization

**Sections**:
1. **Active Tournaments**: List of ongoing tournaments
2. **Completed Tournaments**: Historical tournaments
3. **Tournament Details**: Participants, matches, bracket
4. **Match Entry**: Add/edit match results

---

#### `Login.tsx`
**Purpose**: Authentication interface

**Features**:
- Email/password login
- Password reset flow
- Session management
- Role-based redirect

---

#### `History.tsx`
**Purpose**: Player rating and match history visualization

**Features**:
- Rating history charts
- Match history tables
- Filtering by date range and opponents
- Statistics display

---

#### `Statistics.tsx`
**Purpose**: Tournament and player statistics

**Features**:
- Tournament statistics
- Player performance metrics
- Win/loss records
- Rating trends

---

### Supporting Components

#### `BracketPreview.tsx`
**Purpose**: Visual preview of playoff bracket structure

**Features**:
- Drag-and-drop bracket organization
- Seeding visualization
- Bracket structure editing

---

#### `PlayoffBracket.tsx`
**Purpose**: Interactive playoff bracket management

**Features**:
- Live bracket updates
- Match result entry
- Winner advancement
- BYE handling

---

#### `TraditionalBracket.tsx`
**Purpose**: Traditional bracket visualization

**Features**:
- Visual bracket layout
- Match status indicators
- Winner highlighting

---

#### `MatchEntryPopup.tsx`
**Purpose**: Modal for entering match results

**Features**:
- Player selection
- Score entry
- Forfeit options
- Validation

---

#### `TournamentHeader.tsx`
**Purpose**: Tournament name and metadata display

**Features**:
- Tournament name display
- Edit functionality
- Type indicators (icons)

---

#### `TournamentInfo.tsx`
**Purpose**: Tournament metadata display

**Features**:
- Date range
- Participant count
- Match count

---

#### `SingleMatchHeader.tsx`
**Purpose**: Header for single match tournaments

**Features**:
- Player names
- Match result display
- Completion status

---

## User Flows

### Player Management Flow

```
Players Page
  ├─ View Players (with filters)
  ├─ Add Player
  │   └─ Form Modal
  │       ├─ Basic Info
  │       ├─ Rating
  │       └─ Contact Info
  ├─ Edit Player
  │   └─ Edit Modal
  ├─ Deactivate/Activate Player
  └─ View Player History
      └─ History Page
```

---

### Tournament Creation Flow

#### Round Robin Tournament
```
1. Click "Create Tournament"
2. Select Tournament Type: "Round Robin"
3. Enter Tournament Name (optional)
4. Select Players
   └─ Multi-select from player list
5. Click "Continue"
6. Confirmation Screen
   └─ Review details
7. Click "Create Tournament"
```

#### Playoff Tournament
```
1. Click "Create Tournament"
2. Select Tournament Type: "Playoff"
3. Enter Tournament Name (optional)
4. Select Players (minimum 4)
5. Click "Organize Brackets"
6. Bracket Organization Screen
   └─ Drag-and-drop or auto-seed
7. Click "Continue"
8. Confirmation Screen
9. Click "Create Tournament"
```

#### Preliminary + Playoff Tournament
```
1. Click "Create Tournament"
2. Select Tournament Type: "Preliminary + Playoff"
3. Enter Tournament Name (optional)
4. Set Round Robin Group Size (3-12)
5. Select Players
6. Click "Continue"
7. Confirm Groups Screen
   └─ Review/Edit groups (drag-and-drop)
8. Click "Continue"
9. Select Playoff Bracket Size
   └─ Dropdown with valid options
10. Click "Continue"
11. Confirmation Screen
12. Click "Create Tournament"
```

#### Single Match
```
1. Click "Match" option
2. Select Opponent (if not organizer)
   └─ Requires opponent password
3. Enter Scores
4. Click "Record the Match"
```

---

### Match Entry Flow

#### For Organizers
```
Tournament Page
  ├─ Click "Add Match"
  ├─ Select Players
  ├─ Enter Scores
  └─ Save Match
```

#### For Players
```
Players Page
  ├─ Click "Match"
  ├─ Select Opponent
  ├─ Enter Opponent Password
  ├─ Enter Scores
  └─ Record Match
```

---

### Tournament Completion Flow

```
Tournament Page
  ├─ View All Matches
  ├─ Enter Missing Matches
  ├─ Click "Complete Tournament"
  ├─ Confirmation Dialog
  └─ Tournament Marked Complete
      └─ Rankings Recalculated
```

---

## UI Patterns

### Modals
- **Purpose**: Forms and confirmations
- **Implementation**: Fixed position overlays
- **Features**: 
  - Close on backdrop click
  - Escape key to close
  - Focus management

### Step-by-Step Flows
- **Purpose**: Complex operations (tournament creation)
- **Implementation**: State-managed steps
- **Features**:
  - Progress indicators
  - Continue/Cancel buttons
  - Step validation

### Real-Time Updates
- **Purpose**: Live data synchronization
- **Implementation**: Socket.io client
- **Features**:
  - Automatic refresh on updates
  - No page reload needed
  - Visual indicators for updates

### Tables
- **Purpose**: Data display (players, matches)
- **Implementation**: HTML tables with sorting
- **Features**:
  - Sortable columns
  - Filtering
  - Pagination (where needed)

### Forms
- **Purpose**: Data entry
- **Implementation**: Controlled components
- **Features**:
  - Validation
  - Error messages
  - Success feedback

---

## Styling

### Current Approach
- **Inline Styles**: Most components use inline styles
- **CSS Files**: Some shared styles in `src/styles/`
- **No CSS Framework**: Custom styling

### Color Scheme
- **Primary**: Blue (#3498db)
- **Success**: Green (#27ae60)
- **Error**: Red (#e74c3c)
- **Warning**: Orange (#f39c12)
- **Neutral**: Gray (#95a5a6)

### Typography
- **Font Family**: System fonts
- **Sizes**: 12px, 14px, 16px, 18px, 20px
- **Weights**: Normal, Bold

---

## Responsive Design

### Current State
- **Desktop**: Fully functional
- **Tablet**: Mostly functional
- **Mobile**: Needs optimization

### Breakpoints Needed
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

---

## Accessibility

### Current State
- Basic keyboard navigation
- Some ARIA labels
- Color contrast (needs review)

### Improvements Needed
- Full keyboard navigation
- Screen reader support
- ARIA labels on all interactive elements
- Focus management in modals
- Color contrast compliance

---

## Known UI Issues

### Button Visibility
- **Issue**: Buttons sometimes hidden during scrolling
- **Status**: Recently fixed for tournament creation
- **Solution**: Sticky positioning and z-index management

### Large Components
- **Issue**: Players.tsx is 7800+ lines
- **Impact**: Hard to maintain, slow rendering
- **Solution**: Break into smaller components

### Code Duplication
- **Issue**: Tournament creation logic duplicated
- **Impact**: Inconsistent behavior, hard to maintain
- **Solution**: Extract shared logic into hooks/components

### Loading States
- **Issue**: Limited loading indicators
- **Impact**: Poor UX during API calls
- **Solution**: Add loading spinners/skeletons

### Error Messages
- **Issue**: Inconsistent error display
- **Impact**: Confusing user experience
- **Solution**: Standardize error handling

---

## User Roles & Permissions UI

### Admin
- Full access to all features
- Player management
- Tournament management
- System settings (future)

### Organizer
- Create tournaments
- Create matches for any players
- Edit tournament details
- Complete tournaments

### Player
- View own data
- Create matches for themselves (with opponent password)
- View tournaments
- View statistics

---

## Future UI Improvements

### Planned Enhancements
1. **Component Refactoring**: Break down large components
2. **Design System**: Consistent UI components
3. **Mobile Optimization**: Better mobile experience
4. **Loading States**: Skeleton screens, spinners
5. **Error Handling**: Better error messages and recovery
6. **Accessibility**: Full WCAG compliance
7. **Dark Mode**: Theme switching
8. **Animations**: Smooth transitions
9. **Drag-and-Drop**: Better visual feedback
10. **Tournament Visualization**: Better bracket displays

### Design System Considerations
- Component library (Button, Input, Modal, etc.)
- Theme configuration
- Spacing system
- Typography scale
- Icon system

---

## Navigation Structure

```
/ (Root)
├─ /login
├─ /players
│   ├─ Player List
│   ├─ Tournament Creation
│   └─ Match Creation
├─ /tournaments
│   ├─ Active Tournaments
│   ├─ Completed Tournaments
│   └─ Tournament Details
├─ /history
│   └─ Player History
└─ /statistics
    └─ Tournament Statistics
```

---

## State Management

### Current Approach
- **React Hooks**: useState, useEffect, useMemo
- **Local State**: Component-level state
- **Props Drilling**: Some prop passing through multiple levels

### Future Considerations
- **State Management Library**: Redux, Zustand, or Jotai
- **Context API**: For global state (auth, theme)
- **Server State**: React Query or SWR for API state

---

## Performance Considerations

### Current Issues
- Large component re-renders
- No code splitting
- Limited memoization
- No virtual scrolling for large lists

### Optimizations Needed
- Component memoization (React.memo)
- Code splitting (React.lazy)
- Virtual scrolling for player list
- Debounced search/filtering
- Optimistic updates

---

## Testing Considerations

### Current State
- No automated tests
- Manual testing only

### Recommended Tests
- **Unit Tests**: Component logic, utilities
- **Integration Tests**: User flows
- **E2E Tests**: Critical paths (tournament creation, match entry)
- **Visual Regression**: UI consistency

---

## Browser Support

### Tested Browsers
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

### Known Issues
- IE11: Not supported
- Older browsers: May have issues

---

## Development Workflow

### Component Development
1. Create component file
2. Add TypeScript interfaces
3. Implement with inline styles
4. Test in isolation
5. Integrate into app

### Styling Approach
- Inline styles for component-specific styling
- Shared styles in CSS files
- No CSS-in-JS library

### State Management
- Local state with hooks
- Props for parent-child communication
- Context for global state (limited use)
