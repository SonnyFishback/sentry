import {OrganizationFixture} from 'sentry-fixture/organization';
import {ProjectFixture} from 'sentry-fixture/project';
import {RouteComponentPropsFixture} from 'sentry-fixture/routeComponentPropsFixture';
import {TeamFixture} from 'sentry-fixture/team';

import {initializeOrg} from 'sentry-test/initializeOrg';
import {
  act,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from 'sentry-test/reactTestingLibrary';

import * as projectsActions from 'sentry/actionCreators/projects';
import ProjectsStatsStore from 'sentry/stores/projectsStatsStore';
import ProjectsStore from 'sentry/stores/projectsStore';
import TeamStore from 'sentry/stores/teamStore';
import {Dashboard} from 'sentry/views/projectsDashboard';

jest.unmock('lodash/debounce');
jest.mock('lodash/debounce', () => {
  const debounceMap = new Map();
  const mockDebounce =
    (fn: (...args: any[]) => void, timeout: number) =>
    (...args: any[]) => {
      if (debounceMap.has(fn)) {
        clearTimeout(debounceMap.get(fn));
      }
      debounceMap.set(
        fn,
        setTimeout(() => {
          fn.apply(fn, args);
          debounceMap.delete(fn);
        }, timeout)
      );
    };
  return mockDebounce;
});

describe('ProjectsDashboard', function () {
  const api = new MockApiClient();
  const org = OrganizationFixture();
  const team = TeamFixture();
  const teams = [team];

  beforeEach(function () {
    TeamStore.loadInitialData(teams);
    MockApiClient.addMockResponse({
      url: `/teams/${org.slug}/${team.slug}/members/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: `/organizations/${org.slug}/projects/`,
      body: [],
    });
    ProjectsStatsStore.reset();
    ProjectsStore.loadInitialData([]);
  });

  afterEach(function () {
    TeamStore.reset();
    projectsActions._projectStatsToFetch.clear();
    MockApiClient.clearMockResponses();
  });

  describe('empty state', function () {
    it('renders with no projects', async function () {
      const noProjectTeams = [TeamFixture({isMember: false, projects: []})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          teams={noProjectTeams}
          organization={org}
          {...RouteComponentPropsFixture()}
        />
      );

      expect(
        await screen.findByRole('button', {name: 'Join a Team'})
      ).toBeInTheDocument();
      expect(screen.getByTestId('create-project')).toBeInTheDocument();
      expect(screen.queryByTestId('loading-placeholder')).not.toBeInTheDocument();
    });

    it('renders with 1 project, with no first event', async function () {
      const projects = [ProjectFixture({teams, firstEvent: null, stats: []})];
      ProjectsStore.loadInitialData(projects);

      const teamsWithOneProject = [TeamFixture({projects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          teams={teamsWithOneProject}
          organization={org}
          {...RouteComponentPropsFixture()}
        />
      );

      expect(await screen.findByTestId('join-team')).toBeInTheDocument();
      expect(screen.getByTestId('create-project')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Search for projects by name')
      ).toBeInTheDocument();
      expect(screen.getByText('My Teams')).toBeInTheDocument();
      expect(screen.getByText('Resources')).toBeInTheDocument();
      expect(screen.getByTestId('badge-display-name')).toBeInTheDocument();
      expect(screen.queryByTestId('loading-placeholder')).not.toBeInTheDocument();
    });
  });

  describe('with projects', function () {
    it('renders with two projects', async function () {
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      const projects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamA],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [teamA],
          isBookmarked: true,
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData(projects);
      const teamsWithTwoProjects = [TeamFixture({projects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          organization={org}
          teams={teamsWithTwoProjects}
          {...RouteComponentPropsFixture()}
        />
      );
      expect(await screen.findByText('My Teams')).toBeInTheDocument();
      expect(screen.getAllByTestId('badge-display-name')).toHaveLength(2);
      expect(screen.queryByTestId('loading-placeholder')).not.toBeInTheDocument();
    });

    it('renders only projects for my teams by default', async function () {
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      const teamProjects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamA],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData([
        ...teamProjects,
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [],
          isBookmarked: true,
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ]);
      const teamsWithTwoProjects = [TeamFixture({projects: teamProjects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          organization={org}
          teams={teamsWithTwoProjects}
          {...RouteComponentPropsFixture()}
        />
      );
      expect(await screen.findByText('My Teams')).toBeInTheDocument();
      expect(screen.getAllByTestId('badge-display-name')).toHaveLength(1);
    });

    it('renders all projects if open membership is enabled and user selects all teams', async function () {
      const {
        organization: openOrg,
        router,
        routerProps,
      } = initializeOrg({
        organization: {features: ['open-membership']},
        router: {
          // team='' removes the default selection of 'myteams', same as clicking "clear"
          location: {query: {team: ''}},
        },
      });
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      const teamB = TeamFixture({id: '2', slug: 'team2', name: 'team2', isMember: false});
      TeamStore.loadInitialData([teamA, teamB]);
      const teamProjects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamA],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData([
        ...teamProjects,
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [teamB],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ]);
      const teamsWithTwoProjects = [TeamFixture({projects: teamProjects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          organization={openOrg}
          teams={teamsWithTwoProjects}
          {...routerProps}
        />,
        {
          router,
          organization: openOrg,
        }
      );
      expect(await screen.findByText('All Teams')).toBeInTheDocument();
      expect(screen.getAllByTestId('badge-display-name')).toHaveLength(2);

      await userEvent.click(screen.getByText('All Teams'));
      expect(await screen.findByText('Other Teams')).toBeInTheDocument();
      expect(screen.getByText('#team2')).toBeInTheDocument();
    });

    it('renders only projects for my teams if open membership is disabled', async function () {
      const {
        organization: closedOrg,
        router,
        routerProps,
      } = initializeOrg({
        organization: {features: []},
        router: {
          location: {query: {team: ''}},
        },
      });
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      const teamProjects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamA],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData([
        ...teamProjects,
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ]);
      const teamsWithTwoProjects = [TeamFixture({projects: teamProjects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          organization={closedOrg}
          teams={teamsWithTwoProjects}
          {...routerProps}
        />,
        {
          router,
          organization: closedOrg,
        }
      );
      expect(await screen.findByText('All Teams')).toBeInTheDocument();
      expect(screen.getAllByTestId('badge-display-name')).toHaveLength(1);
    });

    it('renders correct project with selected team', async function () {
      const teamC = TeamFixture({
        id: '1',
        slug: 'teamC',
        isMember: true,
        projects: [
          ProjectFixture({
            id: '1',
            slug: 'project1',
            stats: [],
          }),
          ProjectFixture({
            id: '2',
            slug: 'project2',
            stats: [],
          }),
        ],
      });
      const teamD = TeamFixture({
        id: '2',
        slug: 'teamD',
        isMember: true,
        projects: [
          ProjectFixture({
            id: '3',
            slug: 'project3',
          }),
        ],
      });

      const teamsWithSpecificProjects = [teamC, teamD];

      MockApiClient.addMockResponse({
        url: `/organizations/${org.slug}/teams/?team=2`,
        body: teamsWithSpecificProjects,
      });

      const projects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamC],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [teamC],
          isBookmarked: true,
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
        ProjectFixture({
          id: '3',
          slug: 'project3',
          teams: [teamD],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData(projects);
      MockApiClient.addMockResponse({
        url: `/organizations/${org.slug}/projects/`,
        body: projects,
      });

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          teams={teamsWithSpecificProjects}
          organization={org}
          {...RouteComponentPropsFixture({
            location: {
              pathname: '',
              hash: '',
              state: '',
              action: 'PUSH',
              key: '',
              query: {team: '2'},
              search: '?team=2`',
            },
          })}
        />
      );

      expect(await screen.findByText('project3')).toBeInTheDocument();
      expect(screen.queryByText('project2')).not.toBeInTheDocument();
    });

    it('renders projects by search', async function () {
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      MockApiClient.addMockResponse({
        url: `/organizations/${org.slug}/projects/`,
        body: [],
      });
      const projects = [
        ProjectFixture({
          id: '1',
          slug: 'project1',
          teams: [teamA],
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
        ProjectFixture({
          id: '2',
          slug: 'project2',
          teams: [teamA],
          isBookmarked: true,
          firstEvent: new Date().toISOString(),
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData(projects);
      const teamsWithTwoProjects = [TeamFixture({projects})];

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          teams={teamsWithTwoProjects}
          organization={org}
          {...RouteComponentPropsFixture()}
        />
      );
      await userEvent.type(
        screen.getByPlaceholderText('Search for projects by name'),
        'project2{enter}'
      );
      expect(screen.getByText('project2')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText('project1')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('loading-placeholder')).not.toBeInTheDocument();
    });

    it('renders bookmarked projects first in team list', async function () {
      const teamA = TeamFixture({slug: 'team1', isMember: true});
      const projects = [
        ProjectFixture({
          id: '11',
          slug: 'm',
          teams: [teamA],
          isBookmarked: false,
          stats: [],
        }),
        ProjectFixture({
          id: '12',
          slug: 'm-fave',
          teams: [teamA],
          isBookmarked: true,
          stats: [],
        }),
        ProjectFixture({
          id: '13',
          slug: 'a-fave',
          teams: [teamA],
          isBookmarked: true,
          stats: [],
        }),
        ProjectFixture({
          id: '14',
          slug: 'z-fave',
          teams: [teamA],
          isBookmarked: true,
          stats: [],
        }),
        ProjectFixture({
          id: '15',
          slug: 'a',
          teams: [teamA],
          isBookmarked: false,
          stats: [],
        }),
        ProjectFixture({
          id: '16',
          slug: 'z',
          teams: [teamA],
          isBookmarked: false,
          stats: [],
        }),
      ];

      ProjectsStore.loadInitialData(projects);
      const teamsWithFavProjects = [TeamFixture({projects})];

      MockApiClient.addMockResponse({
        url: `/organizations/${org.slug}/projects/`,
        body: [
          ProjectFixture({
            teams,
            stats: [
              [1517281200, 2],
              [1517310000, 1],
            ],
          }),
        ],
      });

      render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          organization={org}
          teams={teamsWithFavProjects}
          {...RouteComponentPropsFixture()}
        />
      );

      // check that all projects are displayed
      await waitFor(() =>
        expect(screen.getAllByTestId('badge-display-name')).toHaveLength(6)
      );

      const projectName = screen.getAllByTestId('badge-display-name');
      // check that projects are in the correct order - alphabetical with bookmarked projects in front
      expect(within(projectName[0]!).getByText('a-fave')).toBeInTheDocument();
      expect(within(projectName[1]!).getByText('m-fave')).toBeInTheDocument();
      expect(within(projectName[2]!).getByText('z-fave')).toBeInTheDocument();
      expect(within(projectName[3]!).getByText('a')).toBeInTheDocument();
      expect(within(projectName[4]!).getByText('m')).toBeInTheDocument();
      expect(within(projectName[5]!).getByText('z')).toBeInTheDocument();
    });
  });

  describe('ProjectsStatsStore', function () {
    const teamA = TeamFixture({slug: 'team1', isMember: true});
    const projects = [
      ProjectFixture({
        id: '1',
        slug: 'm',
        teams,
        isBookmarked: false,
      }),
      ProjectFixture({
        id: '2',
        slug: 'm-fave',
        teams: [teamA],
        isBookmarked: true,
      }),
      ProjectFixture({
        id: '3',
        slug: 'a-fave',
        teams: [teamA],
        isBookmarked: true,
      }),
      ProjectFixture({
        id: '4',
        slug: 'z-fave',
        teams: [teamA],
        isBookmarked: true,
      }),
      ProjectFixture({
        id: '5',
        slug: 'a',
        teams: [teamA],
        isBookmarked: false,
      }),
      ProjectFixture({
        id: '6',
        slug: 'z',
        teams: [teamA],
        isBookmarked: false,
      }),
    ];

    const teamsWithStatTestProjects = [TeamFixture({projects})];

    it('uses ProjectsStatsStore to load stats', async function () {
      ProjectsStore.loadInitialData(projects);

      jest.useFakeTimers();
      ProjectsStatsStore.onStatsLoadSuccess([
        {...projects[0]!, stats: [[1517281200, 2]]},
      ]);
      const loadStatsSpy = jest.spyOn(projectsActions, 'loadStatsForProject');
      const mock = MockApiClient.addMockResponse({
        url: `/organizations/${org.slug}/projects/`,
        body: projects.map(project => ({
          ...project,
          stats: [
            [1517281200, 2],
            [1517310000, 1],
          ],
        })),
      });

      const {unmount} = render(
        <Dashboard
          api={api}
          error={null}
          loadingTeams={false}
          teams={teamsWithStatTestProjects}
          organization={org}
          {...RouteComponentPropsFixture()}
        />
      );

      expect(loadStatsSpy).toHaveBeenCalledTimes(6);
      expect(mock).not.toHaveBeenCalled();

      const projectSummary = screen.getAllByTestId('summary-links');
      // Has 5 Loading Cards because 1 project has been loaded in store already
      expect(
        within(projectSummary[0]!).getByTestId('loading-placeholder')
      ).toBeInTheDocument();
      expect(
        within(projectSummary[1]!).getByTestId('loading-placeholder')
      ).toBeInTheDocument();
      expect(
        within(projectSummary[2]!).getByTestId('loading-placeholder')
      ).toBeInTheDocument();
      expect(
        within(projectSummary[3]!).getByTestId('loading-placeholder')
      ).toBeInTheDocument();
      expect(within(projectSummary[4]!).getByText('Errors: 2')).toBeInTheDocument();
      expect(
        within(projectSummary[5]!).getByTestId('loading-placeholder')
      ).toBeInTheDocument();

      // Advance timers so that batched request fires
      act(() => jest.advanceTimersByTime(51));
      expect(mock).toHaveBeenCalledTimes(1);
      // query ids = 3, 2, 4 = bookmarked
      // 1 - already loaded in store so shouldn't be in query
      expect(mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          query: expect.objectContaining({
            query: 'id:3 id:2 id:4 id:5 id:6',
          }),
        })
      );
      jest.useRealTimers();

      // All cards have loaded
      await waitFor(() => {
        expect(within(projectSummary[0]!).getByText('Errors: 3')).toBeInTheDocument();
      });
      expect(within(projectSummary[1]!).getByText('Errors: 3')).toBeInTheDocument();
      expect(within(projectSummary[2]!).getByText('Errors: 3')).toBeInTheDocument();
      expect(within(projectSummary[3]!).getByText('Errors: 3')).toBeInTheDocument();
      expect(within(projectSummary[4]!).getByText('Errors: 3')).toBeInTheDocument();
      expect(within(projectSummary[5]!).getByText('Errors: 3')).toBeInTheDocument();

      // Resets store when it unmounts
      unmount();
      expect(ProjectsStatsStore.getAll()).toEqual({});
    });

    it('renders an error from withTeamsForUser', function () {
      ProjectsStore.loadInitialData(projects);

      render(
        <Dashboard
          api={api}
          loadingTeams={false}
          error={Error('uhoh')}
          organization={org}
          teams={[]}
          {...RouteComponentPropsFixture()}
        />
      );

      expect(
        screen.getByText('An error occurred while fetching your projects')
      ).toBeInTheDocument();
    });
  });
});
