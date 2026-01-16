"""Integration tests for Projects API endpoints."""

import pytest
from httpx import AsyncClient


class TestProjectsAPI:
    """Integration tests for /api/v1/projects endpoints."""

    @pytest.fixture
    async def project_factory(self, db_session):
        """Factory to create test projects."""
        _counter = [0]

        async def _create_project(**kwargs):
            from backend.app.models.project import Project

            _counter[0] += 1
            counter = _counter[0]

            defaults = {
                "name": f"Test Project {counter}",
                "description": "Test project description",
                "color": "#FF0000",
            }
            defaults.update(kwargs)

            project = Project(**defaults)
            db_session.add(project)
            await db_session.commit()
            await db_session.refresh(project)
            return project

        return _create_project

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_list_projects_empty(self, async_client: AsyncClient):
        """Verify empty list when no projects exist."""
        response = await async_client.get("/api/v1/projects/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_list_projects_with_data(self, async_client: AsyncClient, project_factory, db_session):
        """Verify list returns existing projects."""
        await project_factory(name="My Project")
        response = await async_client.get("/api/v1/projects/")
        assert response.status_code == 200
        data = response.json()
        assert any(p["name"] == "My Project" for p in data)

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_create_project(self, async_client: AsyncClient):
        """Verify project can be created."""
        data = {
            "name": "New Project",
            "description": "A new project",
            "color": "#00FF00",
        }
        response = await async_client.post("/api/v1/projects/", json=data)
        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "New Project"
        assert result["color"] == "#00FF00"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_project(self, async_client: AsyncClient, project_factory, db_session):
        """Verify single project can be retrieved."""
        project = await project_factory(name="Get Test Project")
        response = await async_client.get(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Get Test Project"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_project_not_found(self, async_client: AsyncClient):
        """Verify 404 for non-existent project."""
        response = await async_client.get("/api/v1/projects/9999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_project(self, async_client: AsyncClient, project_factory, db_session):
        """Verify project can be updated."""
        project = await project_factory(name="Original")
        response = await async_client.patch(
            f"/api/v1/projects/{project.id}", json={"name": "Updated", "description": "Updated description"}
        )
        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Updated"
        assert result["description"] == "Updated description"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_delete_project(self, async_client: AsyncClient, project_factory, db_session):
        """Verify project can be deleted."""
        project = await project_factory()
        response = await async_client.delete(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Project deleted"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_delete_project_not_found(self, async_client: AsyncClient):
        """Verify 404 for deleting non-existent project."""
        response = await async_client.delete("/api/v1/projects/9999")
        assert response.status_code == 404


class TestProjectPartsTracking:
    """Tests for project parts tracking feature."""

    @pytest.fixture
    async def project_factory(self, db_session):
        """Factory to create test projects."""

        async def _create_project(**kwargs):
            from backend.app.models.project import Project

            defaults = {
                "name": "Parts Test Project",
                "description": "Test project",
                "color": "#FF0000",
            }
            defaults.update(kwargs)

            project = Project(**defaults)
            db_session.add(project)
            await db_session.commit()
            await db_session.refresh(project)
            return project

        return _create_project

    @pytest.fixture
    async def archive_factory(self, db_session):
        """Factory to create test archives."""

        async def _create_archive(**kwargs):
            from backend.app.models.archive import PrintArchive

            defaults = {
                "filename": "test.3mf",
                "file_path": "test/test.3mf",
                "file_size": 1000,
                "print_name": "Test Print",
                "status": "completed",
                "quantity": 1,
            }
            defaults.update(kwargs)

            archive = PrintArchive(**defaults)
            db_session.add(archive)
            await db_session.commit()
            await db_session.refresh(archive)
            return archive

        return _create_archive

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_create_project_with_target_parts_count(self, async_client: AsyncClient):
        """Verify project can be created with target_parts_count."""
        data = {
            "name": "Parts Project",
            "target_count": 10,  # 10 plates
            "target_parts_count": 50,  # 50 parts total
        }
        response = await async_client.post("/api/v1/projects/", json=data)
        assert response.status_code == 200
        result = response.json()
        assert result["target_count"] == 10
        assert result["target_parts_count"] == 50

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_project_target_parts_count(self, async_client: AsyncClient, project_factory, db_session):
        """Verify target_parts_count can be updated."""
        project = await project_factory()
        response = await async_client.patch(
            f"/api/v1/projects/{project.id}",
            json={"target_parts_count": 100},
        )
        assert response.status_code == 200
        assert response.json()["target_parts_count"] == 100

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_project_parts_progress_calculation(
        self, async_client: AsyncClient, project_factory, archive_factory, db_session
    ):
        """Verify parts progress is calculated from archive quantities."""
        # Create project with target of 20 parts
        project = await project_factory(target_parts_count=20)

        # Create archives with different quantities
        await archive_factory(project_id=project.id, quantity=3, status="completed")  # 3 parts
        await archive_factory(project_id=project.id, quantity=5, status="completed")  # 5 parts
        await archive_factory(project_id=project.id, quantity=2, status="completed")  # 2 parts
        # Total: 10 parts completed out of 20 = 50%

        response = await async_client.get(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        data = response.json()

        # Check stats
        assert data["stats"]["completed_prints"] == 10  # Sum of quantities
        assert data["stats"]["parts_progress_percent"] == 50.0  # 10/20 = 50%
        assert data["stats"]["remaining_parts"] == 10  # 20 - 10 = 10

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_project_list_shows_parts_count(
        self, async_client: AsyncClient, project_factory, archive_factory, db_session
    ):
        """Verify project list returns correct completed_count (parts sum)."""
        project = await project_factory(name="List Parts Project", target_parts_count=100)

        # Create archives with quantities
        await archive_factory(project_id=project.id, quantity=4, status="completed")
        await archive_factory(project_id=project.id, quantity=6, status="completed")
        # Total: 10 parts, 2 plates

        response = await async_client.get("/api/v1/projects/")
        assert response.status_code == 200
        data = response.json()

        # Find our project
        our_project = next((p for p in data if p["name"] == "List Parts Project"), None)
        assert our_project is not None
        assert our_project["archive_count"] == 2  # 2 plates
        assert our_project["completed_count"] == 10  # 10 parts (sum of quantities)
        assert our_project["target_parts_count"] == 100

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_plates_vs_parts_progress(
        self, async_client: AsyncClient, project_factory, archive_factory, db_session
    ):
        """Verify plates and parts progress are calculated separately."""
        # Project needs 5 plates producing 25 parts total (5 parts per plate)
        project = await project_factory(target_count=5, target_parts_count=25)

        # Complete 2 plates, each with 5 parts
        await archive_factory(project_id=project.id, quantity=5, status="completed")
        await archive_factory(project_id=project.id, quantity=5, status="completed")
        # Plates: 2/5 = 40%, Parts: 10/25 = 40%

        response = await async_client.get(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        data = response.json()

        assert data["stats"]["total_archives"] == 2  # 2 plates
        assert data["stats"]["completed_prints"] == 10  # 10 parts
        assert data["stats"]["progress_percent"] == 40.0  # plates: 2/5
        assert data["stats"]["parts_progress_percent"] == 40.0  # parts: 10/25


class TestProjectArchivesAPI:
    """Tests for project-archive relationships."""

    @pytest.fixture
    async def project_factory(self, db_session):
        """Factory to create test projects."""

        async def _create_project(**kwargs):
            from backend.app.models.project import Project

            defaults = {
                "name": "Archive Test Project",
                "description": "Test project",
                "color": "#0000FF",
            }
            defaults.update(kwargs)

            project = Project(**defaults)
            db_session.add(project)
            await db_session.commit()
            await db_session.refresh(project)
            return project

        return _create_project

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_project_with_archives(self, async_client: AsyncClient, project_factory, db_session):
        """Verify project can be retrieved with archive count."""
        project = await project_factory()
        response = await async_client.get(f"/api/v1/projects/{project.id}")
        assert response.status_code == 200
        # Project should have an archive count (may be 0)
        data = response.json()
        assert "name" in data
